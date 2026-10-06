export interface SlaPolicyLike {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

/** A working period on a weekday. day: 0 = Sunday … 6 = Saturday. Times are local "HH:MM" (end may be "24:00"). */
export interface BusinessInterval {
  day: number;
  start: string;
  end: string;
}

export interface BusinessScheduleLike {
  /** IANA zone, e.g. "Asia/Kolkata", "America/New_York". */
  timezone: string;
  intervals: BusinessInterval[];
  /** Local dates ("YYYY-MM-DD") with no working hours. */
  holidays: string[];
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * SLA targets. With a schedule, the clock only runs during working hours (skipping
 * weekends/holidays); without one it runs 24/7.
 */
export function computeSlaTargets(from: Date, policy: SlaPolicyLike, schedule?: BusinessScheduleLike | null) {
  const add = (minutes: number) =>
    schedule ? addBusinessMinutes(from, minutes, schedule) : new Date(from.getTime() + minutes * 60_000);
  return {
    firstResponseDueAt: add(policy.firstResponseMinutes),
    resolutionDueAt: add(policy.resolutionMinutes),
  };
}

// ---------------------------------------------------------------- time zone helpers (Intl only)

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string) {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a zone. */
function zonedParts(ts: number, timeZone: string) {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(ts))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour! % 24, minute: p.minute!, second: p.second! };
}

/** Zone offset (local − UTC) in ms at an instant. */
function offsetAt(ts: number, timeZone: string) {
  const p = zonedParts(ts, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

/** UTC instant of a local wall-clock time. `localDay` is that date at 00:00 UTC; minutes may be 1440. */
function localToInstant(localDay: number, minutesOfDay: number, timeZone: string) {
  const wall = localDay + minutesOfDay * 60_000;
  const first = wall - offsetAt(wall, timeZone);
  // Second pass corrects for an offset change (DST) between the guess and the real instant.
  return wall - offsetAt(first, timeZone);
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

const DAY_MS = 86_400_000;
const MAX_DAYS_SCANNED = 3660; // ~10 years: guards against a schedule closed by holidays forever

/**
 * Adds `minutes` of working time to `from`. If `from` is outside working hours the clock
 * starts at the next opening. DST-safe: intervals are wall-clock times in the schedule's zone.
 */
export function addBusinessMinutes(from: Date, minutes: number, schedule: BusinessScheduleLike): Date {
  if (minutes <= 0) return new Date(from);
  if (schedule.intervals.length === 0) throw new Error('Business schedule has no working hours');

  const byDay = new Map<number, [number, number][]>();
  for (const i of schedule.intervals) {
    const list = byDay.get(i.day) ?? [];
    list.push([toMinutes(i.start), toMinutes(i.end)]);
    byDay.set(i.day, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a[0] - b[0]);
  const holidays = new Set(schedule.holidays);

  const start = zonedParts(from.getTime(), schedule.timezone);
  let localDay = Date.UTC(start.year, start.month - 1, start.day);
  let cursor = from.getTime();
  let remainingMs = minutes * 60_000;

  for (let i = 0; i < MAX_DAYS_SCANNED; i++, localDay += DAY_MS) {
    const date = new Date(localDay);
    if (holidays.has(date.toISOString().slice(0, 10))) continue;

    for (const [open, close] of byDay.get(date.getUTCDay()) ?? []) {
      const windowStart = Math.max(localToInstant(localDay, open, schedule.timezone), cursor);
      const windowEnd = localToInstant(localDay, close, schedule.timezone);
      if (windowStart >= windowEnd) continue;
      const available = windowEnd - windowStart;
      if (remainingMs <= available) return new Date(windowStart + remainingMs);
      remainingMs -= available;
      cursor = windowEnd;
    }
  }
  throw new Error('Could not fit SLA within business schedule (all days closed?)');
}

export type SlaState = 'none' | 'met' | 'breached' | 'at_risk' | 'ok';

const AT_RISK_MS = 60 * 60_000;

/** Display state for an SLA metric. `metAt` is when the target was satisfied (e.g. firstRespondedAt). */
export function slaState(
  dueAt: Date | string | null,
  metAt: Date | string | null,
  breached: boolean,
  now: Date = new Date(),
): SlaState {
  if (breached) return 'breached';
  if (!dueAt) return 'none';
  const due = new Date(dueAt).getTime();
  if (metAt) return new Date(metAt).getTime() <= due ? 'met' : 'breached';
  const remaining = due - now.getTime();
  if (remaining <= 0) return 'breached';
  return remaining <= AT_RISK_MS ? 'at_risk' : 'ok';
}
