import { cacheGet, cacheSet, cacheDelete } from "./redis";
import {
  findWidgetCache,
  saveWidgetData,
  saveWidgetError,
  clearWidgetCache,
  CachedWidgetData,
} from "../db/repositories/widgets";

// Widget data cache, on two levels

/*
 How long a cached entry stays in Redis
 */
const REDIS_TTL_SECONDS = 3_600;

function cacheKeyFor(widgetId: string): string {
  return `widget:data:${widgetId}`;
}

/* What the read route answers */
export interface WidgetDataPayload {
  data: Record<string, unknown> | null;
  fetchedAt: string | null;
  status: "ok" | "pending" | "error";
  error?: string;
}

/* Redis stores JSON, so dates travel as strings */
interface CachedPayload {
  data: Record<string, unknown> | null;
  fetchedAt: string | null;
  status: "ok" | "pending" | "error";
  error: string | null;
}

function toPayload(cached: CachedPayload): WidgetDataPayload {
  return {
    data: cached.data,
    fetchedAt: cached.fetchedAt,
    status: cached.status,
    ...(cached.error ? { error: cached.error } : {}),
  };
}

function fromDatabase(cached: CachedWidgetData): CachedPayload {
  return {
    data: cached.data,
    fetchedAt: cached.fetchedAt?.toISOString() ?? null,
    status: cached.status,
    error: cached.error,
  };
}

/*
 Reads a widget's data: Redis first, PostgreSQL second
 */
export async function readWidgetData(widgetId: string): Promise<WidgetDataPayload> {
  const hotCopy = await cacheGet<CachedPayload>(cacheKeyFor(widgetId));
  if (hotCopy) {
    return toPayload(hotCopy);
  }
  const durableCopy = fromDatabase(await findWidgetCache(widgetId));

  // Promoted to Redis so the next read is fast. A "pending" entry is not
  // promoted: there is nothing to serve, and caching an absence would delay
  // the first real value by up to an hour
  if (durableCopy.status !== "pending") {
    await cacheSet(cacheKeyFor(widgetId), durableCopy, REDIS_TTL_SECONDS);
  }
  return toPayload(durableCopy);
}

/*
 Stores a successful refresh on both levels
 */
export async function writeWidgetData(
  widgetId: string,
  data: Record<string, unknown>
): Promise<void> {
  await saveWidgetData(widgetId, data);
  const payload: CachedPayload = {
    data,
    fetchedAt: new Date().toISOString(),
    status: "ok",
    error: null,
  };
  await cacheSet(cacheKeyFor(widgetId), payload, REDIS_TTL_SECONDS);
}

/*
 Stores a failed refresh
 */
export async function writeWidgetError(widgetId: string, message: string): Promise<void> {
  await saveWidgetError(widgetId, message);

  const payload: CachedPayload = {
    data: null,
    fetchedAt: new Date().toISOString(),
    status: "error",
    error: message,
  };
  await cacheSet(cacheKeyFor(widgetId), payload, REDIS_TTL_SECONDS);
}

/*
 Empties both levels
 */
export async function invalidateWidgetData(widgetId: string): Promise<void> {
  await clearWidgetCache(widgetId);
  await cacheDelete(cacheKeyFor(widgetId));
}
