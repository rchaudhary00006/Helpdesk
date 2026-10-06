import { Router } from 'express';
import { prisma } from '@helpdesk/db';
import { currentUser, requireAuth } from '../../middleware/auth';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req, res) => {
  const userId = currentUser(req).id;
  const [data, unread] = await prisma.$transaction([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  res.json({ data, unread });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

notificationsRouter.post('/:id/read', async (req, res) => {
  // Scoped by userId so nobody can mark someone else's notifications.
  await prisma.notification.updateMany({
    where: { id: req.params.id, userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});
