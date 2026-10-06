'use client';

import { useRef } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { formatBytes, type useUploads } from '@/hooks/use-uploads';

export function AttachmentPicker({ uploads }: { uploads: ReturnType<typeof useUploads> }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          {uploads.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          Attach files
        </button>
        {uploads.files.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            {f.fileName} <span className="text-slate-400">({formatBytes(f.size)})</span>
            <button type="button" onClick={() => uploads.remove(f.id)} aria-label={`Remove ${f.fileName}`}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      {uploads.error && <p className="text-xs text-red-600">{uploads.error}</p>}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void uploads.add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
