/**
 * In-process domain event bus. Services emit after their transaction commits;
 * subscribers handle side effects (realtime, SLA timers, notifications).
 *
 * Known trade-off: if the process dies between commit and emit, side effects are lost.
 * Upgrade path is a transactional outbox table drained by the worker.
 */
import { EventEmitter } from 'node:events';
import type { Comment, Ticket } from '@helpdesk/db';
import type { AuthUser } from '../middleware/auth';
import type { FieldChanges } from '../modules/tickets/rules';
import type { TicketWithRefs } from '../modules/tickets/selects';
import { logger } from '../lib/logger';

export interface DomainEvents {
  'ticket.created': { ticket: TicketWithRefs; actor: AuthUser };
  'ticket.updated': { ticket: TicketWithRefs; before: Ticket; changes: FieldChanges; actor: AuthUser };
  'comment.created': { ticket: TicketWithRefs; before: Ticket; comment: Comment; actor: AuthUser };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => unknown;

class EventBus {
  private emitter = new EventEmitter();

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emitter.emit(event, payload);
  }

  /** Handlers run asynchronously and never throw back into the request that emitted. */
  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>) {
    this.emitter.on(event, (payload: DomainEvents[K]) => {
      setImmediate(() => {
        Promise.resolve()
          .then(() => handler(payload))
          .catch((err) => logger.error({ err, event }, 'Domain event handler failed'));
      });
    });
  }
}

export const bus = new EventBus();
