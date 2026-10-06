import { Router, type Request } from 'express';
import {
  createCommentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
} from '@helpdesk/shared';
import { currentUser, requireAuth, requireStaff } from '../../middleware/auth';
import * as tickets from './service';

// Express 5 typings lose :param inference when middleware precedes the handler.
const ticketId = (req: Request) => String(req.params.id);

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

ticketsRouter.get('/', async (req, res) => {
  res.json(await tickets.listTickets(currentUser(req), listTicketsQuerySchema.parse(req.query)));
});

ticketsRouter.get('/counts', requireStaff, async (req, res) => {
  res.json(await tickets.ticketCounts(currentUser(req)));
});

ticketsRouter.post('/', async (req, res) => {
  const ticket = await tickets.createTicket(currentUser(req), createTicketSchema.parse(req.body));
  res.status(201).json(ticket);
});

ticketsRouter.get('/:id', async (req, res) => {
  res.json(await tickets.getTicket(currentUser(req), ticketId(req)));
});

ticketsRouter.patch('/:id', async (req, res) => {
  res.json(await tickets.updateTicket(currentUser(req), ticketId(req), updateTicketSchema.parse(req.body)));
});

ticketsRouter.post('/:id/comments', async (req, res) => {
  const comment = await tickets.addComment(currentUser(req), ticketId(req), createCommentSchema.parse(req.body));
  res.status(201).json(comment);
});

ticketsRouter.get('/:id/audit', requireStaff, async (req, res) => {
  res.json(await tickets.getAuditLog(currentUser(req), ticketId(req)));
});
