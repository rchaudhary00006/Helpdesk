# SLA & business hours

Every ticket gets two deadlines when it's created:

| Target | Met when |
| --- | --- |
| **First response** | An agent posts the first *public* reply |
| **Resolution** | The ticket is set to SOLVED (or CLOSED) |

The targets come from the **SLA policy for the ticket's priority**. Each policy runs either **24/7** (calendar time) or on a **business schedule**, where the clock only runs during working hours and skips weekends and holidays.

## Defaults (from the seed)

| Priority | First response | Resolution | Clock |
| --- | --- | --- | --- |
| Urgent | 15 min | 4 h | 24/7 |
| High | 1 h | 9 h (≈ 1 working day) | Standard hours |
| Normal | 4 h | 27 h (≈ 3 working days) | Standard hours |
| Low | 9 h | 45 h (≈ 5 working days) | Standard hours |

*Standard hours* = Mon–Fri 09:00–18:00 in the time zone of the machine that ran the seed (override with `SEED_TIMEZONE=Asia/Kolkata npm run db:seed`), plus two sample holidays.

## Configuring (admins)

**Admin → SLA & hours** in the sidebar (visible to `ADMIN` only; agents can read the config through the API but not change it).

- **Policies.** Set each target in minutes and choose *24/7* or a schedule. The *"If a ticket came in now"* column previews the due dates using the exact function the server uses.
- **Working hours.** Per weekday, any number of periods. Use *Add break/shift* for a lunch break (09:00–13:00 + 14:00–18:00) or a second shift. A day with no periods is closed. To run until midnight, pick 23:59 (stored as `24:00`).
- **Time zone.** IANA name (e.g. `Asia/Kolkata`, `Europe/London`). All working hours and holidays are local to this zone, and DST is handled automatically.
- **Holidays.** Local dates when the clock doesn't run at all.

All changes are recorded in the audit log (`sla.policy_updated`, `sla.schedule_updated`, `sla.holiday_added`, …).

### When do changes take effect?

| Event | SLA due dates |
| --- | --- |
| New ticket | Computed with the current policy |
| Ticket priority changed | **Recomputed** with the new priority's policy, measured from the ticket's creation time |
| Policy / hours / holiday edited | Applies to **future** tickets and priority changes only. Existing due dates are not touched, so editing config never retroactively breaches open tickets |

The ticket's SLA card shows **"SLA · business hours"** or **"SLA · 24/7"** so agents know why a 4-hour target can be due on Monday.

## How it's computed

`addBusinessMinutes()` in `packages/shared/src/sla.ts` (shared by the API and the admin preview):

1. Convert the start instant to the schedule's local date.
2. Walk forward day by day. Skip holidays. For each working period, convert its local start/end to real instants **for that specific date** (so DST changes are respected), and consume minutes from whichever part of the window is after the start.
3. If the ticket arrives outside hours, the clock starts at the next opening (e.g. created Saturday → counts from Monday 09:00).

It uses only the built-in `Intl` API (no date library) and is covered by unit tests in `packages/shared/src/business-hours.test.ts`. These cover weekends, holidays, split shifts, before-opening starts, multi-day targets, `24:00` ends, and DST transitions in New York and London.

Breach detection is unchanged: the worker fires a delayed job at each stored due timestamp (see [architecture](./architecture.md#background-jobs)).

## API

| Method | Path | Who |
| --- | --- | --- |
| GET | `/api/sla/policies` | staff |
| PUT | `/api/sla/policies/:priority` | admin. `{ firstResponseMinutes, resolutionMinutes, scheduleId \| null }` |
| GET | `/api/sla/schedules` | staff (includes holidays) |
| POST | `/api/sla/schedules` | admin. `{ name, timezone, intervals: [{ day: 0-6 (Sun=0), start: "HH:MM", end: "HH:MM" }] }` |
| PUT | `/api/sla/schedules/:id` | admin (same body) |
| DELETE | `/api/sla/schedules/:id` | admin. 409 if a policy still uses it |
| POST | `/api/sla/schedules/:id/holidays` | admin. `{ date: "YYYY-MM-DD", name }`. 409 on duplicate date |
| DELETE | `/api/sla/schedules/:id/holidays/:holidayId` | admin |

Validation rejects overlapping periods on the same day, end-before-start, unknown time zones, impossible dates (`2026-02-30`), and a first-response target longer than the resolution target.

## Not yet supported

- **Pausing the clock while PENDING / ON_HOLD** (waiting on the customer). Today the clock keeps running.
- Multiple schedules chosen per **group** (e.g. a US team and an India team). The model supports many schedules, but a policy points at one.
- Recomputing due dates on open tickets after a config change (opt-in "apply to open tickets").
