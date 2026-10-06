import { describe, expect, it } from 'vitest';
import {
  assertCanComment,
  assertCanUpdate,
  canViewTicket,
  diffFields,
  nextStatusOnComment,
  statusTransitionData,
  ticketScope,
} from './rules';

const agent = { id: 'a1', role: 'AGENT' as const };
const customer = { id: 'c1', role: 'CUSTOMER' as const };
const otherCustomer = { id: 'c2', role: 'CUSTOMER' as const };
const ticket = { requesterId: 'c1', status: 'OPEN' as const };

describe('visibility', () => {
  it('scopes customers to their own tickets and leaves staff unscoped', () => {
    expect(ticketScope(customer)).toEqual({ requesterId: 'c1' });
    expect(ticketScope(agent)).toEqual({});
  });
  it('lets the requester and staff view a ticket, nobody else', () => {
    expect(canViewTicket(customer, ticket)).toBe(true);
    expect(canViewTicket(agent, ticket)).toBe(true);
    expect(canViewTicket(otherCustomer, ticket)).toBe(false);
  });
});

describe('assertCanUpdate', () => {
  it('blocks every edit on closed tickets', () => {
    expect(() => assertCanUpdate(agent, { ...ticket, status: 'CLOSED' }, { priority: 'HIGH' })).toThrow(/closed/i);
  });
  it('lets agents change anything', () => {
    expect(() => assertCanUpdate(agent, ticket, { priority: 'URGENT', assigneeId: 'a1' })).not.toThrow();
  });
  it('only lets customers mark their ticket solved', () => {
    expect(() => assertCanUpdate(customer, ticket, { status: 'SOLVED' })).not.toThrow();
    expect(() => assertCanUpdate(customer, ticket, { priority: 'URGENT' })).toThrow();
    expect(() => assertCanUpdate(customer, ticket, { status: 'OPEN' })).toThrow();
    expect(() => assertCanUpdate(customer, ticket, { status: 'SOLVED', priority: 'LOW' })).toThrow();
  });
});

describe('assertCanComment', () => {
  it('prevents customers from posting internal notes or changing status', () => {
    expect(() => assertCanComment(customer, ticket, { isPublic: false })).toThrow(/internal/);
    expect(() => assertCanComment(customer, ticket, { isPublic: true, status: 'SOLVED' })).toThrow();
    expect(() => assertCanComment(customer, ticket, { isPublic: true })).not.toThrow();
  });
  it('rejects comments on closed tickets', () => {
    expect(() => assertCanComment(agent, { ...ticket, status: 'CLOSED' }, { isPublic: true })).toThrow(/closed/);
  });
});

describe('nextStatusOnComment', () => {
  it('opens a NEW ticket when an agent replies publicly', () => {
    expect(nextStatusOnComment(agent, { ...ticket, status: 'NEW' }, { isPublic: true })).toBe('OPEN');
  });
  it('does not move status for internal notes', () => {
    expect(nextStatusOnComment(agent, { ...ticket, status: 'NEW' }, { isPublic: false })).toBe('NEW');
  });
  it('reopens pending/solved tickets when the requester replies', () => {
    expect(nextStatusOnComment(customer, { ...ticket, status: 'PENDING' }, { isPublic: true })).toBe('OPEN');
    expect(nextStatusOnComment(customer, { ...ticket, status: 'SOLVED' }, { isPublic: true })).toBe('OPEN');
    expect(nextStatusOnComment(customer, { ...ticket, status: 'ON_HOLD' }, { isPublic: true })).toBe('ON_HOLD');
  });
  it('honours an explicit "submit as" status', () => {
    expect(nextStatusOnComment(agent, ticket, { isPublic: true, status: 'PENDING' })).toBe('PENDING');
  });
});

describe('statusTransitionData', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  it('is a no-op when status is unchanged', () => {
    expect(statusTransitionData('OPEN', 'OPEN', now)).toEqual({});
  });
  it('stamps resolvedAt on solve and clears it on reopen', () => {
    expect(statusTransitionData('OPEN', 'SOLVED', now)).toEqual({ status: 'SOLVED', resolvedAt: now });
    expect(statusTransitionData('SOLVED', 'OPEN', now)).toEqual({ status: 'OPEN', resolvedAt: null });
  });
  it('stamps closedAt, and resolvedAt if it was never solved', () => {
    expect(statusTransitionData('SOLVED', 'CLOSED', now)).toEqual({ status: 'CLOSED', closedAt: now });
    expect(statusTransitionData('OPEN', 'CLOSED', now)).toEqual({ status: 'CLOSED', closedAt: now, resolvedAt: now });
  });
});

describe('diffFields', () => {
  it('only reports fields that actually changed', () => {
    const before = { priority: 'LOW', assigneeId: null, tags: ['a'] };
    expect(diffFields(before, { priority: 'LOW', assigneeId: 'x', tags: ['a'] })).toEqual({
      assigneeId: { from: null, to: 'x' },
    });
  });
});
