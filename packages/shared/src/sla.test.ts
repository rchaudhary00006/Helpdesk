import { describe, expect, it } from 'vitest';
import { computeSlaTargets, slaState } from './sla';

describe('computeSlaTargets', () => {
  it('adds policy minutes to the start time', () => {
    const from = new Date('2026-01-01T10:00:00Z');
    const t = computeSlaTargets(from, { firstResponseMinutes: 15, resolutionMinutes: 240 });
    expect(t.firstResponseDueAt.toISOString()).toBe('2026-01-01T10:15:00.000Z');
    expect(t.resolutionDueAt.toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });
});

describe('slaState', () => {
  const now = new Date('2026-01-01T12:00:00Z');

  it('is none without a target', () => {
    expect(slaState(null, null, false, now)).toBe('none');
  });
  it('is breached when the flag is set, regardless of dates', () => {
    expect(slaState('2026-01-02T00:00:00Z', null, true, now)).toBe('breached');
  });
  it('is met when satisfied before the due date', () => {
    expect(slaState('2026-01-01T13:00:00Z', '2026-01-01T11:00:00Z', false, now)).toBe('met');
  });
  it('is breached when satisfied after the due date', () => {
    expect(slaState('2026-01-01T11:00:00Z', '2026-01-01T11:30:00Z', false, now)).toBe('breached');
  });
  it('is at_risk inside the final hour', () => {
    expect(slaState('2026-01-01T12:30:00Z', null, false, now)).toBe('at_risk');
  });
  it('is ok with plenty of time left', () => {
    expect(slaState('2026-01-01T18:00:00Z', null, false, now)).toBe('ok');
  });
  it('is breached once overdue', () => {
    expect(slaState('2026-01-01T11:59:00Z', null, false, now)).toBe('breached');
  });
});
