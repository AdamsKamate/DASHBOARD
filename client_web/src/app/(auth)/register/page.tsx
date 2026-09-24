"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { Button, Card, FormError, Input } from "@/components/ui";
import { api } from "@/lib/api";
import { GuestOnly } from "@/lib/auth/guards";
import { registerErrorMessage, DisplayableError } from "@/lib/auth/messages";

const MIN_PASSWORD_LENGTH = 8;

function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<DisplayableError | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setPasswordError(null);

    // Checked here as well as on the server: the user gets the answer
    // instantly, without a round trip. The server check is the one that
    // actually protects the data.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    setIsSubmitting(true);
    try {
      await api.auth.register({ email, password });
      setIsRegistered(true);
    } catch (error) {
      setFormError(registerErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  // The account is not usable yet: it must be confirmed first (C3). The
  // screen says what to do next rather than silently going back to login.
  if (isRegistered) {
    return (
      <Card title="Compte créé">
        <div className="flex flex-col gap-4 w-80">
          <p className="text-slate-400 text-sm">
            Un email de confirmation vient d&apos;être envoyé à{" "}
            <span className="text-white">{email}</span>. Ouvre le lien qu&apos;il contient
            pour activer ton compte.
          </p>
          <Link href="/login">
            <Button variant="secondary" className="w-full">
              Retour à la connexion
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Créer un compte">
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
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError ?? undefined}
          required
        />

        {formError && <FormError message={formError.message} details={formError.details} />}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Création..." : "Créer mon compte"}
        </Button>

        <p className="text-sm text-slate-400">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-signal">
            Se connecter
          </Link>
        </p>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <GuestOnly>
        <RegisterForm />
      </GuestOnly>
    </Suspense>
  );
}
