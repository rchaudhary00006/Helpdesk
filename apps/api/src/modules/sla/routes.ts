/**
 * Admin configuration for SLA targets, business hours and holidays.
 * Changes apply to tickets created (or re-prioritised) afterwards; existing due dates are kept,
 * so editing a policy never retroactively breaches open tickets.
 */
import { Router, type Request } from 'express';
import { prisma, Prisma } from '@helpdesk/db';
import { businessScheduleSchema, holidaySchema, PRIORITIES, updateSlaPolicySchema, type Priority } from '@helpdesk/shared';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { currentUser, requireAdmin, requireAuth, requireStaff } from '../../middleware/auth';

export const slaRouter = Router();
slaRouter.use(requireAuth);

const param = (req: Request, name: string) => String(req.params[name]);

async function audit(actorId: string, action: string, changes: unknown) {
  await prisma.auditLog.create({ data: { actorId, action, changes: changes as Prisma.InputJsonValue } });
}

const scheduleSelect = {
  id: true,
  name: true,
  timezone: true,
  intervals: true,
  holidays: { select: { id: true, date: true, name: true }, orderBy: { date: 'asc' } },
} satisfies Prisma.BusinessScheduleSelect;

// Staff can read (shown on tickets / for context); only admins can change.
slaRouter.get('/policies', requireStaff, async (_req, res) => {
  const policies = await prisma.slaPolicy.findMany({
    select: { id: true, priority: true, firstResponseMinutes: true, resolutionMinutes: true, scheduleId: true },
  });
  res.json(policies.sort((a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority)));
});

slaRouter.put('/policies/:priority', requireAdmin, async (req, res) => {
  const priority = param(req, 'priority') as Priority;
  if (!PRIORITIES.includes(priority)) throw notFound('SLA policy');
  const input = updateSlaPolicySchema.parse(req.body);
  if (input.scheduleId && !(await prisma.businessSchedule.findUnique({ where: { id: input.scheduleId } }))) {
    throw badRequest('Business schedule does not exist');
  }
  const policy = await prisma.slaPolicy.upsert({
    where: { priority },
    update: input,
    create: { priority, ...input },
  });
  await audit(currentUser(req).id, 'sla.policy_updated', { priority, ...input });
  res.json(policy);
});

slaRouter.get('/schedules', requireStaff, async (_req, res) => {
  res.json(await prisma.businessSchedule.findMany({ select: scheduleSelect, orderBy: { createdAt: 'asc' } }));
});

slaRouter.post('/schedules', requireAdmin, async (req, res) => {
  const input = businessScheduleSchema.parse(req.body);
  try {
    const schedule = await prisma.businessSchedule.create({ data: input, select: scheduleSelect });
    await audit(currentUser(req).id, 'sla.schedule_created', input);
    res.status(201).json(schedule);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('A schedule with that name already exists');
    }
    throw err;
  }
});

slaRouter.put('/schedules/:id', requireAdmin, async (req, res) => {
  const input = businessScheduleSchema.parse(req.body);
  const schedule = await prisma.businessSchedule.update({
    where: { id: param(req, 'id') },
    data: input,
    select: scheduleSelect,
  });
  await audit(currentUser(req).id, 'sla.schedule_updated', input);
  res.json(schedule);
});

slaRouter.delete('/schedules/:id', requireAdmin, async (req, res) => {
  const id = param(req, 'id');
  const inUse = await prisma.slaPolicy.count({ where: { scheduleId: id } });
  if (inUse) throw conflict('This schedule is used by an SLA policy. Switch those policies to another schedule first.');
  await prisma.businessSchedule.delete({ where: { id } });
  await audit(currentUser(req).id, 'sla.schedule_deleted', { id });
  res.status(204).end();
});

slaRouter.post('/schedules/:id/holidays', requireAdmin, async (req, res) => {
  const input = holidaySchema.parse(req.body);
  try {
    const holiday = await prisma.holiday.create({
      data: { scheduleId: param(req, 'id'), ...input },
      select: { id: true, date: true, name: true },
    });
    await audit(currentUser(req).id, 'sla.holiday_added', input);
    res.status(201).json(holiday);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw conflict('There is already a holiday on that date');
      if (err.code === 'P2003') throw notFound('Business schedule');
    }
    throw err;
  }
});

slaRouter.delete('/schedules/:id/holidays/:holidayId', requireAdmin, async (req, res) => {
  const { count } = await prisma.holiday.deleteMany({
    where: { id: param(req, 'holidayId'), scheduleId: param(req, 'id') },
  });
  if (!count) throw notFound('Holiday');
  await audit(currentUser(req).id, 'sla.holiday_removed', { id: param(req, 'holidayId') });
  res.status(204).end();
});
