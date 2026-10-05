// ============================================================================
// How fresh a widget's data is, and when to ask for it again.

/*
 Never poll faster than this, whatever the widget's refresh rate
 */
const MIN_POLL_INTERVAL_MS = 10_000;

/* And never slower than this, so a tab left open does not freeze */
const MAX_POLL_INTERVAL_MS = 120_000;

/*
 How often the block asks the server again
 */
export function pollIntervalFor(refreshRateSeconds: number): number {
  const halfPeriodMs = (refreshRateSeconds * 1000) / 2;
  return Math.min(Math.max(halfPeriodMs, MIN_POLL_INTERVAL_MS), MAX_POLL_INTERVAL_MS);
}

/*
 A random delay before the first poll, in milliseconds
 */
export function pollJitterFor(intervalMs: number): number {
  return Math.floor(Math.random() * Math.min(intervalMs, 5_000));
}

/*
 True when the data is older than it should be
 */
export function isStale(fetchedAt: string | null, refreshRateSeconds: number): boolean {
  if (!fetchedAt) {
    return false;
  }
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  if (Number.isNaN(ageMs)) {
    return false;
  }
  return ageMs > refreshRateSeconds * 2 * 1000;
}

/* Age of the data in seconds, or null when it has never been fetched */
export function ageInSeconds(fetchedAt: string | null): number | null {
  if (!fetchedAt) {
    return null;
  }
  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  return Number.isNaN(ageMs) ? null : Math.max(0, Math.round(ageMs / 1000));
}

/*
 How often the displayed age has to be redrawn
 */
export function clockTickFor(fetchedAt: string | null): number {
  const age = ageInSeconds(fetchedAt);

  if (age === null || age < 60) {
    return 10_000;
  }
  return 60_000;
}
