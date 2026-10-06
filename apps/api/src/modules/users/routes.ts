import { Router } from 'express';
import { prisma } from '@helpdesk/db';
import { requireAuth, requireStaff } from '../../middleware/auth';
import { userSelect } from '../tickets/selects';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireStaff);

/** Assignable agents (for the assignee picker). */
usersRouter.get('/agents', async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'AGENT'] } },
      select: userSelect,
      orderBy: { name: 'asc' },
    }),
  );
});

export const groupsRouter = Router();
groupsRouter.use(requireAuth, requireStaff);

groupsRouter.get('/', async (_req, res) => {
  res.json(await prisma.group.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }));
});
