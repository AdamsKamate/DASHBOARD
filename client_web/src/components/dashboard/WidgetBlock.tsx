"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { LoadingState, WidgetDataView } from "@/components/widgets/WidgetDataView";
import { formatRelativeTime } from "@/lib/widgets/display";
import type { WidgetData, WidgetInstance, WidgetType } from "@/lib/types";

// One block of the grid.

interface WidgetBlockProps {
  widget: WidgetInstance;
  widgetType: WidgetType | undefined;
  onRemove: (widgetId: string) => void;
  /* Starts a move. Absent on read-only screens. */
  onDragHandlePointerDown?: (event: React.PointerEvent) => void;
  /* Arrow keys move the block, Shift + arrows resize it. */
  onDragHandleKeyDown?: (event: React.KeyboardEvent) => void;
  isEditable?: boolean;
}

export function WidgetBlock({
  widget,
  widgetType,
  onRemove,
  onDragHandlePointerDown,
  onDragHandleKeyDown,
  isEditable = false,
}: WidgetBlockProps) {
  // A widget type can disappear from the registry (service removed on the
  // server). The block must still render, so the user can delete it.
  const title = widgetType?.name ?? widget.widgetTypeId;
  const serviceName = widgetType?.service ?? "unknown";
  const paramEntries = Object.entries(widget.params);

  const [dataState, setDataState] = useState<WidgetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      setDataState(await api.widgets.data(widget.id));
    } catch (error) {
      // A 404 means the route is not on the server yet: saying so is more
      // useful than claiming the widget failed.
      const notImplementedYet = error instanceof ApiError && error.status === 404;
      setDataState({
        data: null,
        fetchedAt: null,
        status: "error",
        error: notImplementedYet
          ? "Données disponibles en Phase 3."
          : "Les données n'ont pas pu être récupérées.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [widget.id]);

  /*
   Reloaded when the parameters change: reconfiguring a widget resets its
   cache, so the data on screen no longer matches what it shows.
   */
  useEffect(() => {
    loadData();
  }, [loadData, widget.params]);

  return (
    <article
      className="h-full flex flex-col rounded-md border border-line bg-surface overflow-hidden"
      aria-label={`Widget ${title}`}
    >
      <header className="flex items-stretch justify-between gap-2 bg-raised border-b border-line">
        {/* A button, not a div: it can be reached with Tab, and the arrow keys
            then move the block. Dragging with a mouse and moving with the
            keyboard use the same handle. */}
        <button
          type="button"
          onPointerDown={onDragHandlePointerDown}
          onKeyDown={onDragHandleKeyDown}
          disabled={!isEditable}
          // touch-none tells the browser we handle touch ourselves, otherwise
          // a drag on a phone scrolls the page instead of moving the block.
          className="flex-1 min-w-0 text-left px-3 py-2 touch-none select-none
                     enabled:cursor-move disabled:cursor-default"
          aria-label={
            isEditable
              ? `Déplacer le widget ${title}. Flèches pour déplacer, Maj + flèches pour redimensionner.`
              : `Widget ${title}`
          }
        >
          <span className="block text-xs uppercase tracking-wide text-slate-500">
            {serviceName}
          </span>
          <span className="block text-sm font-semibold text-white truncate">{title}</span>
        </button>

        <button
          type="button"
          onClick={() => onRemove(widget.id)}
          className="shrink-0 h-8 w-8 my-1 mr-2 rounded-md text-slate-400
                     hover:text-flare hover:bg-ink"
          aria-label={`Supprimer le widget ${title}`}
          title="Supprimer"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      {/* The configuration stays visible above the data: two weather widgets
          look alike, and the city is what tells them apart. */}
      {paramEntries.length > 0 && (
        <p className="flex flex-wrap gap-x-3 px-3 pt-2 text-xs text-slate-500">
          {paramEntries.map(([paramName, paramValue]) => (
            <span key={paramName}>
              {paramName} <span className="font-mono text-slate-400">{String(paramValue)}</span>
            </span>
          ))}
        </p>
      )}

      <div className="flex-1 p-3 overflow-auto">
        {isLoading && !dataState ? (
          <LoadingState />
        ) : (
          dataState && <WidgetDataView state={dataState} onRetry={loadData} />
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 px-3 pb-2 text-xs text-slate-600">
        <span>Toutes les {widget.refreshRate} s</span>
        {dataState?.fetchedAt && <span>{formatRelativeTime(dataState.fetchedAt)}</span>}
      </footer>
    </article>
  );
}
