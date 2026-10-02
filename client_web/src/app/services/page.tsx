"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";
import { api } from "@/lib/api";
import { RequireAuth } from "@/lib/auth/guards";
import type { Service } from "@/lib/types";

// Services page: shows OAuth linking state and starts/ends the flow handled
// by server/src/routes/oauth.ts (C5, C6, C13).

const ERROR_MESSAGES: Record<string, string> = {
  unknown_service: "Service inconnu.",
  configuration: "Ce service n'est pas correctement configuré côté serveur.",
  access_denied: "Tu as refusé l'autorisation, ou le fournisseur l'a refusée.",
  invalid_state: "La demande de liaison a expiré ou est invalide. Réessaie.",
  missing_code: "Le fournisseur n'a pas renvoyé de code d'autorisation.",
  exchange_failed: "L'échange avec le fournisseur a échoué.",
  unexpected: "Une erreur inattendue est survenue.",
};

type LoadingState = "loading" | "ready" | "failed";

function ServicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const loadServices = useCallback(async () => {
    setLoadingState("loading");
    try {
      const loaded = await api.services.list();
      setServices(loaded);
      setLoadingState("ready");
    } catch {
      setLoadingState("failed");
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Reads the OAuth callback's result once, then strips it from the URL so a
  // refresh does not replay the same banner.
  useEffect(() => {
    const linked = searchParams.get("linked");
    const error = searchParams.get("error");
    if (!linked && !error) return;

    if (linked) {
      setBanner({ type: "success", message: `Service "${linked}" lié avec succès.` });
      setServices((previous) =>
        previous.map((service) =>
          service.name === linked ? { ...service, subscribed: true } : service
        )
      );
    } else if (error) {
      setBanner({
        type: "error",
        message: ERROR_MESSAGES[error] ?? `Erreur lors de la liaison (${error}).`,
      });
    }
    router.replace("/services");
  }, [searchParams, router]);

  async function handleLink(serviceName: string) {
    setActionError(null);
    try {
      // Navigates away to the provider: nothing local to update here.
      await api.services.link(serviceName);
    } catch {
      setActionError("Impossible de démarrer la liaison avec ce service.");
    }
  }

  async function handleUnlink(serviceName: string) {
    if (!window.confirm(`Délier le service "${serviceName}" ?`)) return;

    setPendingService(serviceName);
    setActionError(null);
    const previousServices = services;
    setServices((previous) =>
      previous.map((service) =>
        service.name === serviceName ? { ...service, subscribed: false } : service
      )
    );
    try {
      await api.services.unlink(serviceName);
    } catch {
      setServices(previousServices);
      setActionError("Le service n'a pas pu être délié.");
    } finally {
      setPendingService(null);
    }
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">Services</h1>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
            ← Retour au dashboard
          </Link>
        </div>
      </header>

      <div className="p-6 flex flex-col gap-6 max-w-2xl">
        {banner &&
          (banner.type === "success" ? (
            <FormSuccess>{banner.message}</FormSuccess>
          ) : (
            <FormError message={banner.message} />
          ))}

        {loadingState === "loading" && (
          <p role="status" className="text-slate-400">
            Chargement des services...
          </p>
        )}

        {loadingState === "failed" && (
          <Card title="Chargement impossible">
            <FormError message="La liste des services n'a pas pu être chargée." />
            <Button className="mt-4" onClick={loadServices}>
              Réessayer
            </Button>
          </Card>
        )}

        {loadingState === "ready" && (
          <>
            {actionError && <FormError message={actionError} />}
            <div className="flex flex-col gap-3">
              {services.map((service) => (
                <Card key={service.name}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white capitalize">{service.name}</p>
                      <p className="text-xs text-slate-400">
                        {service.requiresAuth
                          ? service.subscribed
                            ? "Lié à ton compte"
                            : "Nécessite une autorisation"
                          : "Disponible sans authentification"}
                      </p>
                    </div>
                    {service.requiresAuth &&
                      (service.subscribed ? (
                        <Button
                          variant="danger"
                          disabled={pendingService === service.name}
                          onClick={() => handleUnlink(service.name)}
                        >
                          Délier
                        </Button>
                      ) : (
                        <Button onClick={() => handleLink(service.name)}>Lier</Button>
                      ))}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function ServicesPage() {
  return (
    <RequireAuth>
      <ServicesContent />
    </RequireAuth>
  );
}
