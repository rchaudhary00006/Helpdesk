'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCommentInput, UpdateTicketInput } from '@helpdesk/shared';
import { isStaff } from '@helpdesk/shared';
import { api } from '@/lib/api';

/** Centralised query keys so invalidation (incl. from sockets) stays consistent. */
export const qk = {
  me: ['me'] as const,
  tickets: (params?: string) => (params === undefined ? (['tickets'] as const) : (['tickets', params] as const)),
  counts: ['counts'] as const,
  ticket: (ref?: string) => (ref === undefined ? (['ticket'] as const) : (['ticket', ref] as const)),
  audit: (ref?: string) => (ref === undefined ? (['audit'] as const) : (['audit', ref] as const)),
  agents: ['agents'] as const,
  groups: ['groups'] as const,
  notifications: ['notifications'] as const,
};

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.me, staleTime: 5 * 60_000 });

export function useIsStaff() {
  const { data } = useMe();
  return data ? isStaff(data.role) : false;
}

export const useTickets = (params: URLSearchParams) =>
  useQuery({
    queryKey: qk.tickets(params.toString()),
    queryFn: () => api.listTickets(params),
    placeholderData: (prev) => prev, // keep the table on screen while paging/filtering
  });

export const useTicketCounts = (enabled: boolean) =>
  useQuery({ queryKey: qk.counts, queryFn: api.ticketCounts, enabled });

export const useTicket = (ref: string) => useQuery({ queryKey: qk.ticket(ref), queryFn: () => api.getTicket(ref) });

export const useAuditLog = (ref: string, enabled: boolean) =>
  useQuery({ queryKey: qk.audit(ref), queryFn: () => api.auditLog(ref), enabled });

export const useAgents = (enabled: boolean) =>
  useQuery({ queryKey: qk.agents, queryFn: api.agents, enabled, staleTime: 5 * 60_000 });

export const useGroups = (enabled: boolean) =>
  useQuery({ queryKey: qk.groups, queryFn: api.groups, enabled, staleTime: 5 * 60_000 });

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: api.notifications, refetchInterval: 120_000 });

function useInvalidateTicket(ref: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.ticket(ref) }),
      qc.invalidateQueries({ queryKey: qk.audit(ref) }),
      qc.invalidateQueries({ queryKey: qk.tickets() }),
      qc.invalidateQueries({ queryKey: qk.counts }),
    ]);
}

export function useUpdateTicket(ref: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateTicket(ref);
  return useMutation({
    mutationFn: (patch: UpdateTicketInput) => api.updateTicket(ref, patch),
    onSuccess: (ticket) => {
      qc.setQueryData(qk.ticket(ref), ticket);
      void invalidate();
    },
  });
}

export function useAddComment(ref: string) {
  const invalidate = useInvalidateTicket(ref);
  return useMutation({
    mutationFn: (input: CreateCommentInput) => api.addComment(ref, input),
    onSuccess: () => invalidate(),
  });
}
