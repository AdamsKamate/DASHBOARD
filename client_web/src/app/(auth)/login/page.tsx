"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { ApiRequestError, login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Connexion">
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
          required
        />
        {error && <p className="text-flare text-sm">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
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
