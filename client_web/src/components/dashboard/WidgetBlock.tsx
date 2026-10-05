"use client";

import { LoadingState, WidgetDataView } from "@/components/widgets/WidgetDataView";
import { formatRelativeTime } from "@/lib/widgets/display";
import { useWidgetData } from "@/lib/widgets/useWidgetData";
import { isStale } from "@/lib/widgets/freshness";
import { presentationFor, subtitleFrom } from "@/lib/widgets/presentation";
import type { WidgetInstance, WidgetType } from "@/lib/types";

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
  const presentation = presentationFor(widget.widgetTypeId);
  const title = presentation.title;
  const subtitle = subtitleFrom(widget.params);

  // Kept for the accessible label and the tooltip: the technical name is what
  // appears in API.md and in the logs, so it must stay reachable.
  const technicalName = widgetType?.name ?? widget.widgetTypeId;

  const { data, isInitialLoading, isRefreshing, clockTick, refresh } = useWidgetData(
    widget.id,
    widget.refreshRate,
    widget.params
  );

  // clockTick is read so React redraws the age below; its value is unused.
  void clockTick;

  const isDataStale = isStale(data?.fetchedAt ?? null, widget.refreshRate);

  return (
    <article
      className="h-full flex flex-col rounded-md border border-line bg-surface overflow-hidden"
      aria-label={`Widget ${title}${subtitle ? ` ${subtitle}` : ""}`}
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
              ? `Déplacer le widget ${title}${subtitle ? ` ${subtitle}` : ""}. Flèches pour déplacer, Maj + flèches pour redimensionner.`
              : `Widget ${title}`
          }
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{presentation.icon}</span>
            <span className="text-sm font-semibold text-white truncate">{title}</span>
          </span>
          {/* The configuration, not the service name: two weather widgets are
              told apart by their city, never by the word "weather". */}
          {subtitle && (
            <span className="block truncate text-xs text-muted" title={technicalName}>
              {subtitle}
            </span>
          )}
        </button>

        {/* Shown only during a background refresh: the content stays on
            screen, and this says why it is about to change. */}
        {isRefreshing && (
          <span
            role="status"
            aria-label="Rafraîchissement en cours"
            title="Rafraîchissement en cours"
            className="shrink-0 self-center h-3 w-3 rounded-full border-2
                       border-signal border-t-transparent animate-spin"
          />
        )}

        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="widget-no-drag shrink-0 h-8 w-8 my-1 rounded-md text-slate-400
                     hover:text-signal hover:bg-ink disabled:opacity-40"
          aria-label={`Rafraîchir le widget ${title}`}
          title="Rafraîchir maintenant"
        >
          <span aria-hidden="true">⟳</span>
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

      <div className="flex-1 p-3 overflow-auto">
        {/* The skeleton only shows before the FIRST answer. A later refresh
            leaves the data in place: replacing it every cycle would make the
            dashboard flash. */}
        {isInitialLoading && !data ? (
          <LoadingState />
        ) : (
          data && <WidgetDataView state={data} onRetry={refresh} presentation={presentation} />
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 px-3 pb-2 text-xs text-muted">
        <span>Toutes les {widget.refreshRate} s</span>
        {data?.fetchedAt && (
          <span
            // The exact instant on hover: "il y a 5 min" is readable, but
            // someone diagnosing a stuck widget wants the timestamp.
            title={new Date(data.fetchedAt).toLocaleString("fr-FR")}
            className={isDataStale ? "text-amber" : undefined}
          >
            {isDataStale && <span aria-hidden="true">⚠ </span>}
            {formatRelativeTime(data.fetchedAt)}
          </span>
        )}
      </footer>
    </article>
  );
}
