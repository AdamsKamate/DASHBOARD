"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";
import { verifyAccountOnce } from "@/lib/auth/verifyOnce";
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

    // verifyAccountOnce, not api.auth.verify: React StrictMode runs this
    // effect twice in development, and the confirmation link is single-use.
    // A second request would answer 400 and show an error on a confirmation
    // that actually worked.
    verifyAccountOnce(token)
      .then(() => {
        if (isStillMounted) setState("confirmed");
      })
      .catch((error) => {
        if (!isStillMounted) return;
        setState("failed");
        setFailure(verifyErrorMessage(error));
      });

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
