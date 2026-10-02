"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, FormError, FormSuccess } from "@/components/ui";
import { ServiceCard } from "@/components/services/ServiceCard";
import { api, ApiError } from "@/lib/api";
import { RequireAuth } from "@/lib/auth/guards";
import type { Service } from "@/lib/types";

// /services : the services available, and which ones this account has linked.

/* Messages for the error codes the OAuth callback can send back. */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Tu as refusé l'autorisation. Le compte n'a pas été lié.",
  invalid_state: "La demande a expiré ou n'est plus valable. Réessaie.",
  missing_code: "Le service n'a pas renvoyé de code d'autorisation.",
  exchange_failed: "L'échange avec le service a échoué. Réessaie dans un instant.",
  configuration: "Ce service n'est pas configuré sur le serveur.",
  unknown_service: "Service inconnu.",
  unexpected: "Une erreur inattendue est survenue.",
};

function describeOAuthError(code: string): string {
  return OAUTH_ERROR_MESSAGES[code] ?? "La liaison du compte a échoué.";
}

type LoadingState = "loading" | "ready" | "failed";

function ServicesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [services, setServices] = useState<Service[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  /* Which service has a request in flight, so only its button is disabled. */
  const [busyService, setBusyService] = useState<string | null>(null);

  // Read once on mount: these parameters describe what just happened, and
  // they are cleared from the URL below.
  const [linkedService] = useState(() => searchParams.get("linked"));
  const [oauthError] = useState(() => searchParams.get("error"));

  const loadServices = useCallback(async () => {
    setLoadingState("loading");
    try {
      setServices(await api.services.list());
      setLoadingState("ready");
    } catch (error) {
      // 404 means the route is not on the server yet: the page says so
      // rather than showing a failure.
      const notImplementedYet = error instanceof ApiError && error.status === 404;
      if (notImplementedYet) {
        setServices([]);
        setLoadingState("ready");
        return;
      }
      setLoadingState("failed");
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  /*
   Clears ?linked= and ?error= from the address bar once read.
   */
  useEffect(() => {
    if (linkedService || oauthError) {
      router.replace("/services");
    }
  }, [linkedService, oauthError, router]);

  function handleLink(serviceName: string) {
    setActionError(null);
    setBusyService(serviceName);
    // A full-page navigation towards the provider: nothing comes back here,
    // the browser leaves. busyService stays set on purpose, so the button
    // cannot be clicked twice while the redirect happens.
    api.services.link(serviceName).catch(() => {
      setBusyService(null);
      setActionError("Impossible de démarrer la liaison du compte.");
    });
  }

  async function handleUnlink(serviceName: string) {
    if (!window.confirm(`Délier ton compte ${serviceName} ?`)) {
      return;
    }

    setActionError(null);
    setBusyService(serviceName);

    // Optimistic update: the badge changes immediately, and reverts if the
    // server refuses.
    const previousServices = services;
    setServices((current) =>
      current.map((service) =>
        service.name === serviceName ? { ...service, subscribed: false } : service
      )
    );

    try {
      await api.services.unlink(serviceName);
    } catch {
      setServices(previousServices);
      setActionError("La déliaison a échoué. Réessaie dans un instant.");
    } finally {
      setBusyService(null);
    }
  }

  const linkedCount = services.filter((service) => service.subscribed).length;

  return (
    <main className="min-h-screen bg-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h1 className="text-xl font-semibold text-white">Services</h1>
        <Link href="/dashboard">
          <Button variant="secondary">Retour au dashboard</Button>
        </Link>
      </header>

      <div className="mx-auto max-w-3xl p-6 flex flex-col gap-4">
        {linkedService && (
          <FormSuccess>Ton compte {linkedService} est maintenant lié.</FormSuccess>
        )}
        {oauthError && <FormError message={describeOAuthError(oauthError)} />}
        {actionError && <FormError message={actionError} />}

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

        {loadingState === "ready" && services.length === 0 && (
          <Card title="Services indisponibles">
            <p className="text-sm text-slate-400">
              La route des services n&apos;est pas encore sur le serveur : repasse en
              mode mock (NEXT_PUBLIC_USE_MOCK=true) pour travailler sur cette page.
            </p>
          </Card>
        )}

        {loadingState === "ready" && services.length > 0 && (
          <>
            <p className="text-sm text-slate-400">
              {services.length} service{services.length > 1 ? "s" : ""} disponible
              {services.length > 1 ? "s" : ""}, {linkedCount} lié
              {linkedCount > 1 ? "s" : ""} à ton compte
            </p>

            <div className="flex flex-col gap-3">
              {services.map((service) => (
                <ServiceCard
                  key={service.name}
                  service={service}
                  isBusy={busyService === service.name}
                  onLink={handleLink}
                  onUnlink={handleUnlink}
                />
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
    <Suspense fallback={null}>
      <RequireAuth>
        <ServicesContent />
      </RequireAuth>
    </Suspense>
  );
}
