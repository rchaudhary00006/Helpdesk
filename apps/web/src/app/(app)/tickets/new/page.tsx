'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import {
  createTicketSchema,
  PRIORITIES,
  PRIORITY_LABELS,
  TICKET_TYPES,
  TYPE_LABELS,
  type Priority,
  type TicketType,
} from '@helpdesk/shared';
import { AttachmentPicker } from '@/components/attachment-picker';
import { Button } from '@/components/ui/button';
import { ErrorBanner, Field } from '@/components/ui/field';
import { qk } from '@/hooks/queries';
import { useUploads } from '@/hooks/use-uploads';
import { api, ApiError } from '@/lib/api';

type Errors = Partial<Record<string, string>>;

export default function NewTicketPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const uploads = useUploads();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TicketType>('QUESTION');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [tags, setTags] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const input = {
      subject,
      description,
      type,
      priority,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      attachmentIds: uploads.ids,
    };

    // Same schema the API uses — instant feedback, no round-trip.
    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success) {
      const fe = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v?.[0]])));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const ticket = await api.createTicket(input);
      void qc.invalidateQueries({ queryKey: qk.tickets() });
      void qc.invalidateQueries({ queryKey: qk.counts });
      router.push(`/tickets/${ticket.number}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/tickets" className="mb-3 inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft className="h-4 w-4" /> Back to tickets
      </Link>
      <h1 className="mb-4 text-xl font-semibold">New ticket</h1>

      <form onSubmit={submit} className="card space-y-5 p-6">
        {formError && <ErrorBanner message={formError} />}

        <Field label="Subject" htmlFor="subject" error={errors.subject}>
          <input
            id="subject"
            className="field"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary of the problem"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Type" htmlFor="type">
            <select id="type" className="field" value={type} onChange={(e) => setType(e.target.value as TicketType)}>
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority" htmlFor="priority">
            <select
              id="priority"
              className="field"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description" htmlFor="description" error={errors.description}>
          <textarea
            id="description"
            className="field min-h-[180px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What happened? What did you expect? Steps to reproduce, error messages, timestamps…"
          />
        </Field>

        <Field label="Tags" htmlFor="tags" error={errors.tags} hint="Comma separated, e.g. billing, login">
          <input id="tags" className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>

        <AttachmentPicker uploads={uploads} />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={uploads.uploading}>
            Submit ticket
          </Button>
        </div>
      </form>
    </div>
  );
}
