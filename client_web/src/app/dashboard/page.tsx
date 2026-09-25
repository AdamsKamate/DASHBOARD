"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FormError } from "@/components/ui";
import { WidgetGrid } from "@/components/dashboard/WidgetGrid";
import { AddWidgetPanel } from "@/components/dashboard/AddWidgetPanel";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { RequireAuth } from "@/lib/auth/guards";
import {
  GridItem,
  applyPositionChanges,
  findChangedPositions,
  findFreePosition,
} from "@/lib/dashboard/layout";
import type { Service, WidgetInstance, WidgetType } from "@/lib/types";

// Dashboard page: the widget grid (C10).

type LoadingState = "loading" | "ready" | "failed";

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [widgetTypes, setWidgetTypes] = useState<WidgetType[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoadingState("loading");
    try {
      // The three requests are independent: sent together, not one after
      // the other.
      const [loadedWidgets, loadedWidgetTypes, loadedServices] = await Promise.all([
        api.widgets.list(),
        api.widgetTypes.list(),
        api.services.list(),
      ]);
      setWidgets(loadedWidgets);
      setWidgetTypes(loadedWidgetTypes);
      setServices(loadedServices);
      setLoadingState("ready");
    } catch {
      setLoadingState("failed");
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function handleLayoutCommitted(layout: GridItem[]) {
    const changes = findChangedPositions(widgets, layout);
    if (changes.length === 0) return;

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
    // A deletion cannot be undone: ask first.
    if (!window.confirm("Supprimer ce widget ?")) return;

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
    <main className="min-h-screen bg-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{user?.email}</span>
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

        {loadingState === "ready" && (
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
                <AddWidgetPanel
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
