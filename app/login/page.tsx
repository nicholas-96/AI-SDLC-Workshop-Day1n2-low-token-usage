'use client';

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function authenticate(kind: 'register' | 'login') {
    setError('');
    setPending(true);
    try {
      const optionsResponse = await fetch(`/api/auth/${kind}-options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(typeof options.error === 'string' ? options.error : 'Request failed');
      const credential = kind === 'register'
        ? await startRegistration({ optionsJSON: options })
        : await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch(`/api/auth/${kind}-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), response: credential }),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Verification failed');
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <h1 className="text-3xl font-semibold">Todo App</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Sign in with a passkey. No password.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="block text-sm font-medium" htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          data-testid="login-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
        {error ? <p data-testid="auth-error" className="text-sm text-red-700 dark:text-red-300" role="alert">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="register-button"
            disabled={pending}
            onClick={() => void authenticate('register')}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Register
          </button>
          <button
            type="button"
            data-testid="login-button"
            disabled={pending}
            onClick={() => void authenticate('login')}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-zinc-700"
          >
            Log in
          </button>
        </div>
      </form>
    </main>
  );
}
