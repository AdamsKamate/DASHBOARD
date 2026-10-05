import { fieldLabelFor, isHiddenField } from "./presentation";
// Displaying widget data without knowing the widget.

/* How a value should be rendered. */
export type ValueShape =
  /* A single value: string, number, boolean. */
  | "scalar"
  /* A list of records, shown as rows: commits, forecast days, articles. */
  | "rows"
  /* A list of single values, shown as chips. */
  | "list"
  /* A nested object, shown as its own key/value block. */
  | "record"
  /* null, undefined, or an empty list: nothing to show. */
  | "empty";

export function shapeOf(value: unknown): ValueShape {
  if (value === null || value === undefined || value === "") {
    return "empty";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "empty";
    }
    return value.every(isRecord) ? "rows" : "list";
  }
  if (isRecord(value)) {
    return Object.keys(value).length === 0 ? "empty" : "record";
  }
  return "scalar";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 Keys whose value is the unit of another key.
 */
const UNIT_SUFFIX = "Unit";

export function isUnitKey(key: string): boolean {
  return key.endsWith(UNIT_SUFFIX) && key.length > UNIT_SUFFIX.length;
}

/* The key a unit belongs to: "temperatureUnit" -> "temperature". */
export function valueKeyOfUnit(unitKey: string): string {
  return unitKey.slice(0, -UNIT_SUFFIX.length);
}

/* The unit declared for a key, when the record carries one. */
export function unitFor(record: Record<string, unknown>, key: string): string | null {
  const unit = record[`${key}${UNIT_SUFFIX}`];
  return typeof unit === "string" ? unit : null;
}

/*
 The keys worth displaying, in order.
 */
export function displayableKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(
    (key) => !isUnitKey(key) && !isHiddenField(key) && shapeOf(record[key]) !== "empty"
  );
}

/*
 Formats a single value for display.
 */
export function formatScalar(value: unknown, unit?: string | null): string {
  let text: string;

  if (typeof value === "number") {
    text = Number.isInteger(value) ? value.toLocaleString("fr-FR") : value.toLocaleString("fr-FR");
  } else if (typeof value === "boolean") {
    text = value ? "oui" : "non";
  } else {
    text = String(value);
  }

  // No space before "°C" or "%"
  if (!unit) {
    return text;
  }
  return unit === "%" ? `${text}${unit}` : `${text} ${unit}`;
}

/* True when a string looks like an ISO date or date-time. */
export function looksLikeDate(value: unknown): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(value);
}

/*
 Shows a date the way a human reads it.
 */
export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    // Not a real date after all: showing the raw string beats showing
    // "Invalid Date".
    return value;
  }

  const hasTime = /[T ]\d{2}:\d{2}/.test(value);
  return parsed.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/* How long ago the data was fetched, for the widget footer. */
export function formatRelativeTime(isoDate: string): string {
  const fetchedAt = new Date(isoDate).getTime();
  if (Number.isNaN(fetchedAt)) {
    return "";
  }

  const elapsedSeconds = Math.round((Date.now() - fetchedAt) / 1000);

  if (elapsedSeconds < 60) {
    return "à l'instant";
  }
  if (elapsedSeconds < 3600) {
    return `il y a ${Math.floor(elapsedSeconds / 60)} min`;
  }
  if (elapsedSeconds < 86400) {
    return `il y a ${Math.floor(elapsedSeconds / 3600)} h`;
  }
  return `il y a ${Math.floor(elapsedSeconds / 86400)} j`;
}

/*
 A readable label from a data key.
 */
export function labelFor(key: string): string {
  // A translated label when the field is known; the derived name otherwise,
  // so an unknown service still reads acceptably.
  const translated = fieldLabelFor(key);
  if (translated) {
    return translated;
  }

  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/*
  Picks the field that best identifies a row.
 */
const HEADLINE_KEYS = ["title", "name", "message", "summary", "label", "date", "subject"];

export function headlineKeyOf(row: Record<string, unknown>): string | null {
  for (const candidate of HEADLINE_KEYS) {
    if (typeof row[candidate] === "string" && row[candidate] !== "") {
      return candidate;
    }
  }
  return null;
}

/* True when a string is an http(s) link we can turn into an anchor. */
export function looksLikeUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\/\S+$/.test(value);
}
