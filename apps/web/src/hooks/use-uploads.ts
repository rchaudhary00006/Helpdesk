'use client';

import { useState } from 'react';
import type { AttachmentDto } from '@helpdesk/shared';
import { api, ApiError } from '@/lib/api';

/** Uploads files immediately on pick; the form submits only the resulting attachment ids. */
export function useUploads() {
  const [files, setFiles] = useState<AttachmentDto[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const add = async (list: FileList | null) => {
    if (!list) return;
    setError(null);
    await Promise.all(
      [...list].map(async (file) => {
        setUploading((n) => n + 1);
        try {
          const a = await api.upload(file);
          setFiles((f) => [...f, a]);
        } catch (err) {
          setError(err instanceof ApiError ? `${file.name}: ${err.message}` : `${file.name}: upload failed`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  };

  return {
    files,
    ids: files.map((f) => f.id),
    uploading: uploading > 0,
    error,
    add,
    remove: (id: string) => setFiles((f) => f.filter((x) => x.id !== id)),
    reset: () => setFiles([]),
  };
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
