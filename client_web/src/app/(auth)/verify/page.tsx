"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";
import { api } from "@/lib/api";
import { verifyErrorMessage, DisplayableError } from "@/lib/auth/messages";

type VerificationState = "checking" | "confirmed" | "failed";

function VerificationResult() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<VerificationState>("checking");
  const [failure, setFailure] = useState<DisplayableError | null>(null);

  useEffect(() => {
    if (!token) {
      setState("failed");
      setFailure({ message: "Lien invalide : aucun token n'a été fourni." });
      return;
    }

    let isStillMounted = true;

    api.auth
      .verify(token)
      .then(() => {
        if (isStillMounted) setState("confirmed");
      })
      .catch((error) => {
        if (!isStillMounted) return;
        setState("failed");
        setFailure(verifyErrorMessage(error));
      });

    // React runs effects twice in development. Without this flag, the second
    // run would call /auth/verify with an already-consumed token and display
    // an error on a confirmation that actually worked.
    return () => {
      isStillMounted = false;
    };
  }, [token]);

  return (
    <Card title="Confirmation du compte">
      <div className="flex flex-col gap-4 w-80">
        {state === "checking" && (
          <p role="status" className="text-slate-400 text-sm">
            Vérification en cours...
          </p>
        )}

        {state === "confirmed" && (
          <>
            <FormSuccess>Ton compte est confirmé.</FormSuccess>
            <Link href="/login">
              <Button className="w-full">Se connecter</Button>
            </Link>
          </>
        )}

        {state === "failed" && failure && (
          <>
            <FormError message={failure.message} details={failure.details} />
            <Link href="/register">
              <Button variant="secondary" className="w-full">
                Créer un compte
              </Button>
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerificationResult />
    </Suspense>
  );
}
