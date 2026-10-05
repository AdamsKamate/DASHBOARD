import { cacheGet, cacheSet, cacheDelete } from "../lib/redis";
import type { ExternalApiFailure } from "../lib/httpClient";

// Pausing a service that is failing (circuit breaker)

/* How long a service stays paused, per kind of failure */
const COOLDOWN_SECONDS: Partial<Record<ExternalApiFailure, number>> = {
  // The provider explicitly told us to slow down.
  rate_limited: 120,
  // 5xx: broken on their side, and usually for more than a few second
  provider_error: 60,
  // Unreachable: DNS, network, or the provider is gone
  unreachable: 30,
  // No answer in time. Could be a passing slowdown
  timeout: 30,
};

/*
 Two failures are deliberately absent:

   rejected our request was wrong a city that does not exist
   unreadable  one malformed answer, which the next call may well fix
 */

interface ServicePause {
  reason: ExternalApiFailure;
  message: string;
  until: string;
}

function pauseKeyFor(serviceName: string): string {
  return `service:paused:${serviceName}`;
}

/*
 Starts a pause, if this kind of failure deserves one
 */
export async function pauseServiceIfNeeded(
  serviceName: string,
  failure: ExternalApiFailure,
  message: string
): Promise<number | null> {
  const cooldownSeconds = COOLDOWN_SECONDS[failure];
  if (!cooldownSeconds) {
    return null;
  }

  const pause: ServicePause = {
    reason: failure,
    message,
    until: new Date(Date.now() + cooldownSeconds * 1000).toISOString(),
  };

  // Redis expires the key on its own, so the pause lifts without anything
  // having to remember to lift it
  await cacheSet(pauseKeyFor(serviceName), pause, cooldownSeconds);

  return cooldownSeconds;
}

/* The current pause of a service, or null when it is healthy */
export async function getServicePause(serviceName: string): Promise<ServicePause | null> {
  return cacheGet<ServicePause>(pauseKeyFor(serviceName));
}

/*
 Lifts a pause early
 */
export async function clearServicePause(serviceName: string): Promise<void> {
  await cacheDelete(pauseKeyFor(serviceName));
}

/* A message the user can act on, or at least understand */
export function describeServicePause(pause: ServicePause): string {
  const secondsLeft = Math.max(
    0,
    Math.round((new Date(pause.until).getTime() - Date.now()) / 1000)
  );
  if (pause.reason === "rate_limited") {
    return `Service momentanément saturé, nouvelle tentative dans ${secondsLeft} s.`;
  }
  return `Service momentanément indisponible, nouvelle tentative dans ${secondsLeft} s.`;
}
