export interface SlaPolicyLike {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

/**
 * SLA targets in calendar time.
 * TODO: business hours + holidays — swap the implementation here; callers don't change.
 */
export function computeSlaTargets(from: Date, policy: SlaPolicyLike) {
  return {
    firstResponseDueAt: new Date(from.getTime() + policy.firstResponseMinutes * 60_000),
    resolutionDueAt: new Date(from.getTime() + policy.resolutionMinutes * 60_000),
  };
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
