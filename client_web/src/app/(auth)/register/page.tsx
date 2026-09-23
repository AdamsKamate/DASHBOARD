"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { ApiRequestError, register } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card title="Compte créé">
        <p className="text-slate-400 text-sm">
          Vérifie tes emails pour confirmer ton compte avant de te connecter.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Créer un compte">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-80">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className="text-flare text-sm">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Création..." : "Créer mon compte"}
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
