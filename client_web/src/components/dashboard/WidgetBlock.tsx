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
  const title = widgetType?.name ?? widget.widgetTypeId;
  const serviceName = widgetType?.service ?? "unknown";
  const paramEntries = Object.entries(widget.params);

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

      <div className="flex-1 p-3 text-sm text-slate-400 overflow-auto">
        {paramEntries.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mb-3">
            {paramEntries.map(([paramName, paramValue]) => (
              <div key={paramName} className="contents">
                <dt className="text-slate-500">{paramName}</dt>
                <dd className="text-white font-mono truncate">{String(paramValue)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-slate-500">
          Rafraîchi toutes les {widget.refreshRate} s · données en Phase 2
        </p>
      </div>
    </article>
  );
}
