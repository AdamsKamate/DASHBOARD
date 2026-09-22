"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { ApiRequestError, verify } from "@/lib/api";

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Lien invalide : aucun token fourni");
      return;
    }
    verify(token)
      .then(() => setStatus("ok"))
      .catch((e) => {
        setStatus("error");
        setError(e instanceof ApiRequestError ? e.message : "Une erreur est survenue");
      });
  }, [token]);

  return (
    <Card title="Confirmation du compte">
      {status === "pending" && <p className="text-slate-400 text-sm">Vérification en cours...</p>}
      {status === "ok" && (
        <div className="flex flex-col gap-4">
          <p className="text-pulse text-sm">Compte confirmé.</p>
          <Link href="/login">
            <Button>Se connecter</Button>
          </Link>
        </div>
      )}
      {status === "error" && <p className="text-flare text-sm">{error}</p>}
    </Card>
  );
}
