import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '@helpdesk/db';
import { isStaff } from '@helpdesk/shared';
import { env } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { currentUser, requireAuth } from '../../middleware/auth';
import { canViewTicket } from '../tickets/rules';

/*
 * Two-step upload: POST the file first (returns an id), then reference the id when creating
 * the ticket/comment. Keeps JSON endpoints simple and lets the UI show upload progress.
 * Local disk for now — swap for S3 presigned uploads in production.
 */

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: env.UPLOAD_DIR,
    // Never trust the client filename on disk.
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Expected a multipart "file" field');
  const attachment = await prisma.attachment.create({
    data: {
      uploaderId: currentUser(req).id,
      fileName: path.basename(req.file.originalname).slice(0, 255),
      mimeType: req.file.mimetype,
      size: req.file.size,
      storageKey: req.file.filename,
    },
    select: { id: true, fileName: true, mimeType: true, size: true },
  });
  res.status(201).json(attachment);
});

attachmentsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const a = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: { ticket: { select: { requesterId: true } }, comment: { select: { isPublic: true } } },
  });
  const visible =
    a &&
    (a.ticket
      ? canViewTicket(user, a.ticket) && (isStaff(user.role) || a.comment?.isPublic !== false)
      : a.uploaderId === user.id);
  if (!a || !visible) throw notFound('Attachment');

  // Always download, never render inline — prevents stored XSS via uploaded HTML/SVG.
  res.download(path.join(env.UPLOAD_DIR, a.storageKey), a.fileName, {
    headers: { 'Content-Type': a.mimeType, 'X-Content-Type-Options': 'nosniff' },
  });
});
