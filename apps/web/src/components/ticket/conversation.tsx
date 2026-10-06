import clsx from 'clsx';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Lock, Mail, Paperclip } from 'lucide-react';
import { isStaff, type CommentDto } from '@helpdesk/shared';
import { Avatar } from '@/components/ui/badges';
import { formatBytes } from '@/hooks/use-uploads';
import { attachmentUrl } from '@/lib/api';

export function Conversation({ comments, requesterId }: { comments: CommentDto[]; requesterId: string }) {
  return (
    <ol className="space-y-4">
      {comments.map((c) => {
        const internal = !c.isPublic;
        return (
          <li
            key={c.id}
            className={clsx('card p-4', internal && 'border-amber-200 bg-amber-50')}
          >
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar name={c.author.name} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-medium">
                  {c.author.name}
                  {isStaff(c.author.role) && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                      {c.author.role.toLowerCase()}
                    </span>
                  )}
                  {c.author.id === requesterId && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">requester</span>
                  )}
                </p>
                <p className="text-xs text-slate-400" title={format(new Date(c.createdAt), 'PPpp')}>
                  {formatDistanceToNowStrict(new Date(c.createdAt), { addSuffix: true })}
                  {c.via === 'EMAIL' && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle">
                      <Mail className="h-3 w-3" /> via email
                    </span>
                  )}
                </p>
              </div>
              {internal && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                  <Lock className="h-3 w-3" /> Internal note
                </span>
              )}
            </div>
            {/* Plain text rendering — user content is never injected as HTML. */}
            <div className="whitespace-pre-wrap break-words pl-[42px] text-sm leading-relaxed text-slate-700">
              {c.body}
            </div>
            {c.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 pl-[42px]">
                {c.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={attachmentUrl(a.id)}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-700"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {a.fileName}
                    <span className="text-slate-400">{formatBytes(a.size)}</span>
                  </a>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
