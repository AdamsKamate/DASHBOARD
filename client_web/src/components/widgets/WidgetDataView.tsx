"use client";

import Link from "next/link";
import type { WidgetData } from "@/lib/types";
import { classifyWidgetError, errorStyleFor } from "@/lib/widgets/errors";
import {
  displayableKeys,
  formatDate,
  formatScalar,
  headlineKeyOf,
  isRecord,
  labelFor,
  looksLikeDate,
  looksLikeUrl,
  shapeOf,
  unitFor,
} from "@/lib/widgets/display";

// Rendering the data of a widget, whatever its type.

interface WidgetDataViewProps {
  state: WidgetData;
  onRetry?: () => void;
}

export function WidgetDataView({ state, onRetry }: WidgetDataViewProps) {
  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorState message={state.error} onRetry={onRetry} />

        {/* The last known values stay below the message when the server kept
            them. A temperature from ten minutes ago, clearly labelled as
            such, is more useful than an empty block. */}
        {state.data && (
          <div className="opacity-60">
            <p className="mb-1 text-xs text-slate-500">Dernières données connues</p>
            <RecordView record={state.data} />
          </div>
        )}
      </div>
    );
  }

  // "pending" means the worker has not fetched anything yet: the widget was
  // just added, or its configuration changed. It is not an error.
  if (state.status === "pending" || !state.data) {
    return <PendingState />;
  }

  return <RecordView record={state.data} />;
}

/* Shown while the first request is in flight. */
export function LoadingState() {
  return (
    <div className="flex flex-col gap-2 animate-pulse" role="status" aria-label="Chargement">
      <div className="h-3 w-2/3 rounded bg-line" />
      <div className="h-3 w-1/2 rounded bg-line" />
      <div className="h-3 w-3/5 rounded bg-line" />
    </div>
  );
}

function PendingState() {
  return (
    <p className="text-sm text-slate-500">
      Données en attente du premier rafraîchissement.
    </p>
  );
}

function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const presentation = classifyWidgetError(message);
  const style = errorStyleFor(presentation.kind);

  return (
    <div
      // A framed, tinted block rather than a line of red text: on a grid of
      // twelve widgets, a failure has to be visible at a glance, without
      // reading.
      className={`flex flex-col gap-2 rounded-md border p-3 ${style.border} ${style.background}`}
    >
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className="shrink-0">
          {style.icon}
        </span>
        {/* role="alert" so a screen reader announces the failure instead of
            leaving the user with a silently empty widget. */}
        <p role="alert" className={`text-sm ${style.text}`}>
          {message ?? "Les données n'ont pas pu être récupérées."}
        </p>
      </div>

      {presentation.hint && <p className="text-xs text-slate-400">{presentation.hint}</p>}

      <div className="flex items-center gap-3">
        {presentation.action && (
          <Link
            href={presentation.action.href}
            className="widget-no-drag text-xs text-signal hover:underline"
          >
            {presentation.action.label}
          </Link>
        )}

        {/* Offered only when retrying could plausibly work. A button that
            cannot change the outcome — a city that does not exist, an expired
            authorisation — only invites the user to click in vain. */}
        {presentation.canRetry && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="widget-no-drag text-xs text-signal hover:underline"
          >
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}

/* A record: one line per key, nested blocks for anything deeper. */
function RecordView({ record }: { record: Record<string, unknown> }) {
  const keys = displayableKeys(record);
  if (keys.length === 0) {
    return <p className="text-sm text-slate-500">Aucune donnée à afficher.</p>;
  }
  return (
    <dl className="flex flex-col gap-2">
      {keys.map((key) => (
        <ValueView key={key} label={labelFor(key)} value={record[key]} unit={unitFor(record, key)} />
      ))}
    </dl>
  );
}

function ValueView({
  label,
  value,
  unit,
}: {
  label: string;
  value: unknown;
  unit: string | null;
}) {
  switch (shapeOf(value)) {
    case "rows":
      return (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 flex flex-col gap-2">
            {(value as Record<string, unknown>[]).map((row, index) => (
              <RowView key={index} row={row} />
            ))}
          </dd>
        </div>
      );

    case "list":
      return (
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {(value as unknown[]).map((item, index) => (
              <span key={index} className="rounded bg-raised px-2 py-0.5 text-xs text-white">
                {formatScalar(item)}
              </span>
            ))}
          </dd>
        </div>
      );

    case "record":
      return (
        <div className="rounded border border-line p-2">
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1">
            <RecordView record={value as Record<string, unknown>} />
          </dd>
        </div>
      );

    default:
      return (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
          <dd className="min-w-0 text-right text-sm text-white">
            <ScalarView value={value} unit={unit} />
          </dd>
        </div>
      );
  }
}

/** One row of a list: a headline, then its other fields. */
function RowView({ row }: { row: Record<string, unknown> }) {
  const headlineKey = headlineKeyOf(row);
  const otherKeys = displayableKeys(row).filter((key) => key !== headlineKey);

  return (
    <div className="rounded border border-line bg-ink/40 px-2 py-1.5">
      {headlineKey && (
        <p className="truncate text-sm text-white">
          <ScalarView value={row[headlineKey]} unit={null} />
        </p>
      )}
      {otherKeys.length > 0 && (
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
          {otherKeys.map((key) => (
            <span key={key}>
              <span className="text-slate-500">{labelFor(key)} </span>
              <ScalarView value={row[key]} unit={unitFor(row, key)} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/* A single value: link, date, or plain text */
function ScalarView({ value, unit }: { value: unknown; unit: string | null }) {
  if (looksLikeUrl(value)) {
    return (
      <a
        href={String(value)}
        target="_blank"
        rel="noopener noreferrer"
        // noopener matters: without it, the opened page can reach back into
        // ours through window.opener
        className="widget-no-drag text-signal hover:underline"
      >
        Ouvrir
      </a>
    );
  }
  if (looksLikeDate(value)) {
    return <span>{formatDate(String(value))}</span>;
  }
  return <span className="font-mono">{formatScalar(value, unit)}</span>;
}
