import { describe, expect, it } from 'vitest';
import { businessScheduleSchema, holidaySchema, updateSlaPolicySchema } from './schemas';
import { addBusinessMinutes, computeSlaTargets, isValidTimeZone, type BusinessScheduleLike } from './sla';

const weekdays = (start: string, end: string) => [1, 2, 3, 4, 5].map((day) => ({ day, start, end }));

// Asia/Kolkata is UTC+05:30 with no DST — easy to reason about.
const IST: BusinessScheduleLike = { timezone: 'Asia/Kolkata', intervals: weekdays('09:00', '18:00'), holidays: [] };
const ist = (local: string) => new Date(`${local}+05:30`);
const iso = (d: Date) => d.toISOString();

// 2026-10-05 is a Monday.
describe('addBusinessMinutes', () => {
  it('adds within the same working day', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-05T10:00:00'), 60, IST))).toBe(iso(ist('2026-10-05T11:00:00')));
  });

  it('spills over into the next working day', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-05T17:30:00'), 60, IST))).toBe(iso(ist('2026-10-06T09:30:00')));
  });

  it('starts the clock at opening time when created before hours', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-05T07:00:00'), 30, IST))).toBe(iso(ist('2026-10-05T09:30:00')));
  });

  it('skips the weekend (Friday evening → Monday)', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-09T17:00:00'), 120, IST))).toBe(iso(ist('2026-10-12T10:00:00')));
  });

  it('treats a ticket created on Saturday as starting Monday 09:00', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-10T12:00:00'), 15, IST))).toBe(iso(ist('2026-10-12T09:15:00')));
  });

  it('skips holidays', () => {
    const withHoliday = { ...IST, holidays: ['2026-10-06'] }; // Tuesday off
    expect(iso(addBusinessMinutes(ist('2026-10-05T17:30:00'), 60, withHoliday))).toBe(iso(ist('2026-10-07T09:30:00')));
  });

  it('respects split shifts (lunch break)', () => {
    const split = { ...IST, intervals: [...weekdays('09:00', '13:00'), ...weekdays('14:00', '18:00')] };
    expect(iso(addBusinessMinutes(ist('2026-10-05T12:30:00'), 60, split))).toBe(iso(ist('2026-10-05T14:30:00')));
  });

  it('handles multi-day targets (24 business hours = 2 days 6h at 9h/day)', () => {
    expect(iso(addBusinessMinutes(ist('2026-10-05T09:00:00'), 24 * 60, IST))).toBe(iso(ist('2026-10-07T15:00:00')));
  });

  it('supports a 24:00 end time', () => {
    const late = { ...IST, intervals: [{ day: 1, start: '20:00', end: '24:00' }] };
    expect(iso(addBusinessMinutes(ist('2026-10-05T23:00:00'), 120, late))).toBe(iso(ist('2026-10-12T21:00:00')));
  });

  it('is DST-correct (New York, DST ends Sun 2026-11-01)', () => {
    const ny: BusinessScheduleLike = { timezone: 'America/New_York', intervals: weekdays('09:00', '18:00'), holidays: [] };
    // Fri 17:00 EDT (21:00Z) + 2h → 1h Friday + 1h Monday → Mon 10:00 EST (15:00Z)
    expect(iso(addBusinessMinutes(new Date('2026-10-30T21:00:00Z'), 120, ny))).toBe('2026-11-02T15:00:00.000Z');
  });

  it('is DST-correct when the clocks spring forward (London, Sun 2027-03-28)', () => {
    const ldn: BusinessScheduleLike = { timezone: 'Europe/London', intervals: weekdays('09:00', '17:00'), holidays: [] };
    // Fri 16:00 GMT + 2h → 1h Fri + 1h Mon → Mon 10:00 BST = 09:00Z
    expect(iso(addBusinessMinutes(new Date('2027-03-26T16:00:00Z'), 120, ldn))).toBe('2027-03-29T09:00:00.000Z');
  });

  it('returns the start time for zero minutes', () => {
    const t = ist('2026-10-10T03:00:00');
    expect(iso(addBusinessMinutes(t, 0, IST))).toBe(iso(t));
  });

  it('throws for a schedule with no working hours', () => {
    expect(() => addBusinessMinutes(new Date(), 10, { ...IST, intervals: [] })).toThrow(/no working hours/);
  });
});

describe('computeSlaTargets', () => {
  const policy = { firstResponseMinutes: 60, resolutionMinutes: 9 * 60 };
  it('uses calendar time without a schedule', () => {
    const t = computeSlaTargets(ist('2026-10-09T17:00:00'), policy);
    expect(iso(t.firstResponseDueAt)).toBe(iso(ist('2026-10-09T18:00:00')));
  });
  it('uses business time with a schedule', () => {
    const t = computeSlaTargets(ist('2026-10-09T17:00:00'), policy, IST);
    expect(iso(t.firstResponseDueAt)).toBe(iso(ist('2026-10-09T18:00:00')));
    expect(iso(t.resolutionDueAt)).toBe(iso(ist('2026-10-12T17:00:00')));
  });
});

describe('isValidTimeZone', () => {
  it('validates IANA zones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('admin schemas', () => {
  it('rejects impossible holiday dates instead of rolling them over', () => {
    expect(holidaySchema.safeParse({ date: '2026-02-30', name: 'x' }).success).toBe(false);
    expect(holidaySchema.safeParse({ date: '2028-02-29', name: 'Leap day' }).success).toBe(true);
  });
  it('rejects overlapping periods, end-before-start and unknown zones', () => {
    const base = { name: 'Std', timezone: 'Asia/Kolkata' };
    expect(businessScheduleSchema.safeParse({ ...base, intervals: [{ day: 1, start: '09:00', end: '13:00' }, { day: 1, start: '12:00', end: '18:00' }] }).success).toBe(false);
    expect(businessScheduleSchema.safeParse({ ...base, intervals: [{ day: 1, start: '18:00', end: '09:00' }] }).success).toBe(false);
    expect(businessScheduleSchema.safeParse({ ...base, timezone: 'Nowhere/Land', intervals: [{ day: 1, start: '09:00', end: '18:00' }] }).success).toBe(false);
    expect(businessScheduleSchema.safeParse({ ...base, intervals: [{ day: 1, start: '09:00', end: '13:00' }, { day: 1, start: '13:00', end: '24:00' }] }).success).toBe(true);
  });
  it('requires first response <= resolution', () => {
    expect(updateSlaPolicySchema.safeParse({ firstResponseMinutes: 600, resolutionMinutes: 60, scheduleId: null }).success).toBe(false);
  });
});
