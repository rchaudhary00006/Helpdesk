/**
 * Email threading + reply parsing helpers shared by the API (inbound) and worker (outbound).
 *
 * Threading strategy:
 *  - Every outgoing email about ticket N gets Message-ID <ticket-N.{unique}@domain> and
 *    References/In-Reply-To <ticket-N@domain>. Mail clients echo these back on reply.
 *  - Inbound mail is matched by those headers first, then by the "[#N]" subject token.
 */

export const REPLY_MARKER = '##- Please type your reply above this line -##';

/** Extracts the bare address from `"Name" <addr@x.com>` or `addr@x.com`. */
export function emailAddressOf(value: string): string {
  const angle = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (angle?.[1] ?? value.trim()).toLowerCase();
}

export const emailDomainOf = (value: string) => emailAddressOf(value).split('@')[1] ?? 'localhost';

export const ticketThreadId = (ticketNumber: number, domain: string) => `<ticket-${ticketNumber}@${domain}>`;

export const ticketMessageId = (ticketNumber: number, unique: string, domain: string) =>
  `<ticket-${ticketNumber}.${unique}@${domain}>`;

/** Finds a ticket number in Message-ID style header values (In-Reply-To, References). */
export function ticketNumberFromHeaders(values: (string | undefined)[]): number | null {
  for (const v of values) {
    if (!v) continue;
    const m = v.match(/<ticket-(\d{1,9})[.@]/);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Finds "[#123]" in a subject line. */
export function ticketNumberFromSubject(subject: string | undefined): number | null {
  const m = subject?.match(/\[#(\d{1,9})\]/);
  return m ? Number(m[1]) : null;
}

/** "Re: Fwd: [#12] Printer on fire" → "Printer on fire" */
export function cleanSubject(subject: string | undefined): string {
  return (subject ?? '')
    .replace(/^(\s*(re|fw|fwd|aw|sv|antw)\s*(\[\d+\])?\s*:\s*)+/i, '')
    .replace(/\[#\d+\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUOTE_HEADER_PATTERNS = [
  /^-{2,}\s*Original Message\s*-{2,}$/i, // Outlook (plain)
  /^_{20,}$/, // Outlook separator line
  /^Sent from my \w+/i, // mobile footers
  /^Get Outlook for (iOS|Android)/i,
];

/**
 * Returns only the new content of an email reply — drops quoted history, the reply marker and
 * signatures. Deliberately conservative: when unsure, keep text (losing words is worse than noise).
 */
export function extractReply(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');

  const marker = text.indexOf(REPLY_MARKER);
  if (marker >= 0) text = text.slice(0, text.lastIndexOf('\n', marker) + 1);

  const lines = text.split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Gmail / Apple Mail: "On Mon, 6 Oct 2026 at 13:15, Helpdesk <x@y> wrote:" (may wrap onto 2–3 lines)
    if (/^On\s/.test(trimmed)) {
      const joined = lines.slice(i, i + 3).join(' ');
      if (/^On\s[\s\S]{1,300}?wrote:/.test(joined.trim())) break;
    }
    // Outlook: "From: X" followed shortly by "Sent:"/"Date:"
    if (/^From:\s/i.test(trimmed) && lines.slice(i + 1, i + 4).some((l) => /^(Sent|Date):\s/i.test(l.trim()))) break;
    if (QUOTE_HEADER_PATTERNS.some((p) => p.test(trimmed))) break;
    // RFC 3676 signature delimiter
    if (line === '-- ' || line === '--') break;

    kept.push(line);
  }

  // Drop trailing quoted block / blank lines.
  while (kept.length && (kept[kept.length - 1]!.trim() === '' || kept[kept.length - 1]!.startsWith('>'))) kept.pop();

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** RFC 3834 & de-facto headers that mark automatic mail — never turn these into tickets (mail loops!). */
export function autoReplyReason(headers: Record<string, string | undefined>): string | null {
  const h = (k: string) => headers[k.toLowerCase()]?.toLowerCase().trim();
  const autoSubmitted = h('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return `auto-submitted: ${autoSubmitted}`;
  const precedence = h('precedence');
  if (precedence && ['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) return `precedence: ${precedence}`;
  // Note: X-Auto-Response-Suppress is NOT a signal — Outlook sets it on ordinary human mail too.
  if (h('x-autoreply') || h('x-autorespond')) return 'auto-reply header present';
  if (h('list-id') || h('list-unsubscribe')) return 'mailing list';
  return null;
}
