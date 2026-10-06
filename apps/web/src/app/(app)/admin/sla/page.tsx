'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import {
  computeSlaTargets,
  PRIORITY_LABELS,
  WEEKDAYS,
  type BusinessScheduleDto,
  type SlaPolicyDto,
} from '@helpdesk/shared';
import { PriorityLabel } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { ErrorBanner, Field, PageSpinner } from '@/components/ui/field';
import { useMe } from '@/hooks/queries';
import { api, ApiError } from '@/lib/api';

const keys = { policies: ['sla-policies'] as const, schedules: ['sla-schedules'] as const };

const humanMinutes = (m: number) => {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
};

const errorText = (err: unknown) => {
  if (!(err instanceof ApiError)) return err ? 'Something went wrong' : null;
  const first = err.issues?.fieldErrors && Object.values(err.issues.fieldErrors).flat()[0];
  return first ?? err.message;
};

const toScheduleLike = (s: BusinessScheduleDto) => ({
  timezone: s.timezone,
  intervals: s.intervals,
  holidays: s.holidays.map((h) => h.date),
});

// ---------------------------------------------------------------- policies

function PolicyRow({ policy, schedules }: { policy: SlaPolicyDto; schedules: BusinessScheduleDto[] }) {
  const qc = useQueryClient();
  const [fr, setFr] = useState(policy.firstResponseMinutes);
  const [res, setRes] = useState(policy.resolutionMinutes);
  const [scheduleId, setScheduleId] = useState(policy.scheduleId);
  const save = useMutation({
    mutationFn: () =>
      api.updateSlaPolicy(policy.priority, { firstResponseMinutes: fr, resolutionMinutes: res, scheduleId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.policies }),
  });
  const dirty =
    fr !== policy.firstResponseMinutes || res !== policy.resolutionMinutes || scheduleId !== policy.scheduleId;

  // Live preview with the exact same function the server uses.
  const preview = useMemo(() => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    try {
      return computeSlaTargets(new Date(), { firstResponseMinutes: fr || 0, resolutionMinutes: res || 0 }, schedule ? toScheduleLike(schedule) : null);
    } catch {
      return null;
    }
  }, [fr, res, scheduleId, schedules]);

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <PriorityLabel priority={policy.priority} />
      </td>
      {[
        [fr, setFr],
        [res, setRes],
      ].map(([value, set], i) => (
        <td key={i} className="px-4 py-3">
          <input
            type="number"
            min={1}
            className="field w-28"
            value={value as number}
            onChange={(e) => (set as (n: number) => void)(Number(e.target.value))}
            aria-label={`${PRIORITY_LABELS[policy.priority]} ${i ? 'resolution' : 'first response'} minutes`}
          />
          <p className="mt-1 text-xs text-slate-400">{humanMinutes(value as number)}</p>
        </td>
      ))}
      <td className="px-4 py-3">
        <select
          className="field w-48"
          value={scheduleId ?? ''}
          onChange={(e) => setScheduleId(e.target.value || null)}
          aria-label={`${PRIORITY_LABELS[policy.priority]} hours`}
        >
          <option value="">24/7 (calendar time)</option>
          {schedules.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {preview ? (
          <>
            <p>Response by {format(preview.firstResponseDueAt, 'EEE d MMM, HH:mm')}</p>
            <p>Resolve by {format(preview.resolutionDueAt, 'EEE d MMM, HH:mm')}</p>
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
        {save.error && <p className="mt-1 max-w-48 text-xs text-red-600">{errorText(save.error)}</p>}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- schedule editor

type Period = { start: string; end: string };

function ScheduleEditor({ schedule }: { schedule: BusinessScheduleDto }) {
  const qc = useQueryClient();
  const [name, setName] = useState(schedule.name);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [days, setDays] = useState<Period[][]>(() =>
    WEEKDAYS.map((_, day) =>
      schedule.intervals
        .filter((i) => i.day === day)
        .sort((a, b) => a.start.localeCompare(b.start))
        .map(({ start, end }) => ({ start, end })),
    ),
  );
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []), []);

  const refresh = () => qc.invalidateQueries({ queryKey: keys.schedules });
  const save = useMutation({
    mutationFn: () =>
      api.updateSchedule(schedule.id, {
        name,
        timezone,
        intervals: days.flatMap((periods, day) => periods.map((p) => ({ day, ...p }))),
      }),
    onSuccess: refresh,
  });
  const addHoliday = useMutation({
    mutationFn: () => api.addHoliday(schedule.id, { date: holidayDate, name: holidayName }),
    onSuccess: () => {
      setHolidayDate('');
      setHolidayName('');
      return refresh();
    },
  });
  const removeHoliday = useMutation({
    mutationFn: (id: string) => api.removeHoliday(schedule.id, id),
    onSuccess: refresh,
  });

  const setPeriod = (day: number, idx: number, patch: Partial<Period>) =>
    setDays((d) => d.map((ps, i) => (i === day ? ps.map((p, j) => (j === idx ? { ...p, ...patch } : p)) : ps)));
  const addPeriod = (day: number) =>
    setDays((d) => d.map((ps, i) => (i === day ? [...ps, ps.length ? { start: '14:00', end: '18:00' } : { start: '09:00', end: '18:00' }] : ps)));
  const removePeriod = (day: number, idx: number) =>
    setDays((d) => d.map((ps, i) => (i === day ? ps.filter((_, j) => j !== idx) : ps)));

  // Monday-first display order.
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <section className="card p-5">
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Field label="Schedule name" htmlFor={`name-${schedule.id}`}>
          <input id={`name-${schedule.id}`} className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Time zone" htmlFor={`tz-${schedule.id}`} hint="All times below are local to this zone">
          <input
            id={`tz-${schedule.id}`}
            className="field"
            list={`zones-${schedule.id}`}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id={`zones-${schedule.id}`}>
            {zones.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Working hours</h3>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {order.map((day) => (
          <div key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-24 text-sm font-medium">{WEEKDAYS[day]}</span>
            {days[day]!.length === 0 && <span className="text-sm text-slate-400">Closed</span>}
            {days[day]!.map((p, idx) => (
              <span key={idx} className="flex items-center gap-1">
                <input
                  type="time"
                  className="field w-28 py-1"
                  value={p.start}
                  onChange={(e) => setPeriod(day, idx, { start: e.target.value })}
                  aria-label={`${WEEKDAYS[day]} start`}
                />
                <span className="text-slate-400">–</span>
                <input
                  type="time"
                  className="field w-28 py-1"
                  value={p.end === '24:00' ? '23:59' : p.end}
                  onChange={(e) => setPeriod(day, idx, { end: e.target.value === '23:59' ? '24:00' : e.target.value })}
                  aria-label={`${WEEKDAYS[day]} end`}
                />
                <button
                  type="button"
                  onClick={() => removePeriod(day, idx)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  aria-label={`Remove ${WEEKDAYS[day]} period`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => addPeriod(day)}
              className="inline-flex items-center gap-0.5 text-xs text-brand-600 hover:underline"
            >
              <Plus className="h-3 w-3" /> {days[day]!.length ? 'Add break/shift' : 'Open'}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {save.error && <span className="text-sm text-red-600">{errorText(save.error)}</span>}
        {save.isSuccess && !save.isPending && <span className="text-sm text-emerald-600">Saved</span>}
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Save hours
        </Button>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-slate-500">Holidays</h3>
      <p className="mb-2 text-xs text-slate-400">SLA clocks pause for the whole day on these local dates.</p>
      <ul className="mb-3 divide-y divide-slate-100 rounded-md border border-slate-200">
        {schedule.holidays.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No holidays</li>}
        {schedule.holidays.map((h) => (
          <li key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              <span className="font-mono text-slate-500">{h.date}</span>
              <span className="ml-3">{h.name}</span>
            </span>
            <button
              onClick={() => removeHoliday.mutate(h.id)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              aria-label={`Remove ${h.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addHoliday.mutate();
        }}
      >
        <input
          type="date"
          className="field w-44"
          value={holidayDate}
          onChange={(e) => setHolidayDate(e.target.value)}
          aria-label="Holiday date"
          required
        />
        <input
          className="field w-64"
          placeholder="Name, e.g. Diwali"
          value={holidayName}
          onChange={(e) => setHolidayName(e.target.value)}
          aria-label="Holiday name"
          required
        />
        <Button type="submit" variant="secondary" loading={addHoliday.isPending}>
          Add holiday
        </Button>
        {addHoliday.error && <span className="self-center text-sm text-red-600">{errorText(addHoliday.error)}</span>}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- page

export default function SlaAdminPage() {
  const { data: me } = useMe();
  const isAdmin = me?.role === 'ADMIN';
  const policies = useQuery({ queryKey: keys.policies, queryFn: api.slaPolicies, enabled: isAdmin });
  const schedules = useQuery({ queryKey: keys.schedules, queryFn: api.schedules, enabled: isAdmin });

  if (!isAdmin) return <div className="p-6"><ErrorBanner message="Only admins can manage SLA settings." /></div>;
  if (policies.isLoading || schedules.isLoading) return <PageSpinner />;
  if (policies.error || schedules.error) return <div className="p-6"><ErrorBanner message={errorText(policies.error ?? schedules.error) ?? ''} /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">SLA &amp; business hours</h1>
        <p className="text-sm text-slate-500">
          Targets are in minutes. With a schedule, the clock only runs during working hours. Changes apply to new
          tickets and to tickets whose priority changes; existing due dates are kept.
        </p>
      </div>

      <section className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">First response (min)</th>
              <th className="px-4 py-2.5 font-medium">Resolution (min)</th>
              <th className="px-4 py-2.5 font-medium">Hours</th>
              <th className="px-4 py-2.5 font-medium">If a ticket came in now</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {policies.data?.map((p) => (
              // key includes server values so the row resets after a save/refetch
              <PolicyRow key={`${p.id}-${p.firstResponseMinutes}-${p.resolutionMinutes}-${p.scheduleId}`} policy={p} schedules={schedules.data ?? []} />
            ))}
          </tbody>
        </table>
      </section>

      {schedules.data?.map((s) => (
        // Stable key: holidays render from props, so refetches never discard unsaved hour edits.
        <ScheduleEditor key={s.id} schedule={s} />
      ))}
    </div>
  );
}
