import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '@helpdesk/db';
import { loginSchema, type Me } from '@helpdesk/shared';
import { unauthorized } from '../../lib/errors';
import { clearSessionCookie, currentUser, requireAuth, setSessionCookie } from '../../middleware/auth';

export const authRouter = Router();

// Compared against when the email doesn't exist, so response time doesn't reveal valid accounts.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-padding', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts, try again later' } },
});

async function loadMe(userId: string): Promise<Me> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      organization: { select: { id: true, name: true } },
      groups: { select: { group: { select: { id: true, name: true } } } },
    },
  });
  return { ...u, groups: u.groups.map((g) => g.group) };
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) throw unauthorized('Invalid email or password');

  setSessionCookie(res, user.id);
  res.json(await loadMe(user.id));
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await loadMe(currentUser(req).id));
});
