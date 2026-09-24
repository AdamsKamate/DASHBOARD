"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, FormError, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { GuestOnly } from "@/lib/auth/guards";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { loginErrorMessage, DisplayableError } from "@/lib/auth/messages";

function LoginForm() {
  // login() comes from useAuth, not from api.auth directly: it also updates
  // the shared session state.
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<DisplayableError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      // Back to the page the user was heading for, or the dashboard.
      router.replace(safeRedirectPath(searchParams.get("next")));
    } catch (error) {
      setFormError(loginErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Card title="Connexion">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {formError && <FormError message={formError.message} details={formError.details} />}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Connexion..." : "Se connecter"}
        </Button>

        <p className="text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link href="/register" className="text-signal">
            Créer un compte
          </Link>
        </p>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  // useSearchParams (here and in GuestOnly) requires a Suspense boundary in
  // the Next.js App Router.
  return (
    <Suspense fallback={null}>
      <GuestOnly>
        <LoginForm />
      </GuestOnly>
    </Suspense>
  );
}
