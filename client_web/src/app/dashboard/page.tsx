"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, FormError } from "@/components/ui";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";
import { AddWidgetModal } from "@/components/dashboard/AddWidgetModal";
import { ServiceIcons } from "@/components/dashboard/ServiceIcons";
import { SettingsMenu } from "@/components/SettingsMenu";
import { api, ApiError, USE_MOCK } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { RequireAuth } from "@/lib/auth/guards";
import {
  GridItem,
  applyPositionChanges,
  findChangedPositions,
  findFreePosition,
} from "@/lib/dashboard/layout";
import type { Service, WidgetInstance, WidgetType } from "@/lib/types";

// Dashboard page: the widget grid (C10)
type LoadingState = "loading" | "ready" | "failed";

function isNotImplementedYet(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<WidgetType[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [widgetsAvailable, setWidgetsAvailable] = useState(true);
  const loadDashboard = useCallback(async () => {
    setLoadingState("loading");
    try {
      // The three requests are independent: sent together, not one after
      // the other
      const [loadedWidgets, loadedWidgetTypes, loadedServices] = await Promise.all([
        api.widgets.list(),
        api.widgetTypes.list(),
        api.services.list(),
      ]);
      setWidgets(loadedWidgets);
      setWidgetTypes(loadedWidgetTypes);
      setServices(loadedServices);
      setWidgetsAvailable(true);
      setLoadingState("ready");
    } catch (error) {
      if (isNotImplementedYet(error)) {
        setWidgetsAvailable(false);
        setLoadingState("ready");
        return;
      }
      setLoadingState("failed");
    }
  }, []);
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  async function handleLayoutCommitted(layout: GridItem[]) {
    const changes = findChangedPositions(widgets, layout);
    if (changes.length === 0) {
      return;
    }
    const previousWidgets = widgets;
    setWidgets(applyPositionChanges(widgets, changes));
    setActionError(null);
    try {
      await Promise.all(
        changes.map((change) =>
          api.widgets.update(change.widgetId, { position: change.position })
        )
      );
    } catch {
      setWidgets(previousWidgets);
      setActionError("Le déplacement n'a pas pu être enregistré.");
    }
  }

  async function handleRemove(widgetId: string) {
    // A deletion cannot be undone: ask first
    if (!window.confirm("Supprimer ce widget ?")) {
      return;
    }
    const previousWidgets = widgets;
    setWidgets(widgets.filter((widget) => widget.id !== widgetId));
    setActionError(null);

    try {
      await api.widgets.remove(widgetId);
    } catch {
      setWidgets(previousWidgets);
      setActionError("Le widget n'a pas pu être supprimé.");
    }
  }

  function handleCreated(createdWidget: WidgetInstance) {
    setWidgets((previous) => [...previous, createdWidget]);
    setIsAddPanelOpen(false);
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main id="main-content" className="min-h-screen bg-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          {/* Which backend the front end is talking to. Development aid:
              remove it, or hide it behind NODE_ENV, before the final build */}
          <span
            className="text-xs px-2 py-0.5 rounded border border-line text-slate-400"
            title={
              USE_MOCK
                ? "Données simulées dans le navigateur"
                : "Requêtes envoyées au serveur réel"
            }
          >
            {USE_MOCK ? "mock" : "serveur réel"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* State of every service at a glance, and a shortcut to linking
              one. The Services button stays: it is where unlinking lives. */}
          <ServiceIcons services={services} />

          <SettingsMenu />

          {/* Shown only to administrators. The server refuses the page to
              anyone else anyway; hiding the link spares the others a door
              that does not open. */}
          {user?.role === "admin" && (
            <Link
              href="/admin"
              className="rounded-md border border-line px-3 py-2 text-sm text-white hover:border-signal"
            >
              Administration
            </Link>
          )}

          <Link href="/services">
            <Button variant="secondary">Services</Button>
          </Link>
          <span className="hidden text-sm text-slate-400 sm:inline">{user?.email}</span>
          <Button variant="secondary" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
      </header>

      <div className="p-6 flex flex-col gap-6">
        {loadingState === "loading" && (
          <p role="status" className="text-slate-400">
            Chargement du dashboard...
          </p>
        )}

        {loadingState === "failed" && (
          <Card title="Chargement impossible">
            <FormError message="Le dashboard n'a pas pu être chargé." />
            <Button className="mt-4" onClick={loadDashboard}>
              Réessayer
            </Button>
          </Card>
        )}

        {loadingState === "ready" && !widgetsAvailable && (
          <Card title="Widgets indisponibles">
            <p className="text-sm text-slate-400">
              L&apos;authentification fonctionne sur le serveur réel. Les routes des
              widgets arrivent en Phase 2 : repasse en mode mock
              (NEXT_PUBLIC_USE_MOCK=true) pour travailler sur la grille.
            </p>
          </Card>
        )}

        {loadingState === "ready" && widgetsAvailable && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                {widgets.length} widget{widgets.length > 1 ? "s" : ""}
              </p>
              {!isAddPanelOpen && (
                <Button onClick={() => setIsAddPanelOpen(true)}>Ajouter un widget</Button>
              )}
            </div>

            {actionError && <FormError message={actionError} />}

            {isAddPanelOpen && (
              <div className="max-w-md">
                <AddWidgetModal
                  widgetTypes={widgetTypes}
                  services={services}
                  position={findFreePosition(widgets)}
                  onCreated={handleCreated}
                  onCancel={() => setIsAddPanelOpen(false)}
                />
              </div>
            )}

            {widgets.length === 0 ? (
              <Card title="Ton dashboard est vide">
                <p className="text-sm text-slate-400">
                  Ajoute un premier widget pour commencer.
                </p>
              </Card>
            ) : (
              <WidgetGrid
                widgets={widgets}
                widgetTypes={widgetTypes}
                onLayoutCommitted={handleLayoutCommitted}
                onRemove={handleRemove}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
