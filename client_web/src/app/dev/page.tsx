"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth/AuthProvider";
import { GuestOnly } from "../../lib/auth/guards";
import { safeRedirectPath } from "../../lib/auth/redirect";

// Minimal login page.
// Written for card 1.9, because the guards need a page to redirect to.

/* Maps an API error to a message the user can act on. */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
        return "Incorrect email or password.";
    }
    if (error.status === 403) {
        return "Please confirm your account using the link sent by email.";
    }
    if (error.status === 400) {
        return "Please enter your email and password.";
    }
  }
  return "Unable to reach the server. Please try again.";
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace(safeRedirectPath(searchParams.get("next")));
    } catch (error) {
      setErrorMessage(loginErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="text-2xl font-bold text-slate-900">Log in</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <GuestOnly>
        <LoginForm />
      </GuestOnly>
    </Suspense>
  );
}