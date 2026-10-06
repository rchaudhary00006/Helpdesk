'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBanner, Field } from '@/components/ui/field';
import { api, ApiError } from '@/lib/api';

const DEMO_ACCOUNTS = [
  ['admin@helpdesk.local', 'Admin'],
  ['alice@helpdesk.local', 'Agent'],
  ['carol@acme.test', 'Customer'],
] as const;

function LoginForm() {
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login({ email, password });
      // Only allow same-site relative redirects (prevents open-redirect via ?next=).
      const next = search.get('next');
      window.location.href = next?.startsWith('/') && !next.startsWith('//') ? next : '/tickets';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-6 w-6 text-brand-600" />
        <h1 className="text-lg font-semibold">Sign in to Helpdesk</h1>
      </div>
      {error && <ErrorBanner message={error} />}
      <Field label="Email" htmlFor="email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Sign in
      </Button>

      {process.env.NODE_ENV !== 'production' && (
        <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
          <p className="mb-1.5">Demo accounts (password <code className="font-mono">Password123!</code>):</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map(([addr, label]) => (
              <button
                key={addr}
                type="button"
                onClick={() => {
                  setEmail(addr);
                  setPassword('Password123!');
                }}
                className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
