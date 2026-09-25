import type { WidgetInstance, WidgetType } from "@/lib/types";

// One block of the grid.

interface WidgetBlockProps {
  widget: WidgetInstance;
  widgetType: WidgetType | undefined;
  onRemove: (widgetId: string) => void;
}

export function WidgetBlock({ widget, widgetType, onRemove }: WidgetBlockProps) {
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
      <header
        className="widget-drag-handle flex items-center justify-between gap-2
                   px-3 py-2 border-b border-line cursor-move select-none"
      >
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">{serviceName}</p>
          <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
        </div>

        {/* widget-no-drag: a click on this button must delete, not start a
            drag. react-grid-layout ignores elements carrying this class. */}
        <button
          type="button"
          onClick={() => onRemove(widget.id)}
          className="widget-no-drag shrink-0 h-8 w-8 rounded-md text-slate-400
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
