// Calling a third-party API.

/* Nobody waits ten seconds for a widget. */
const DEFAULT_TIMEOUT_MS = 8_000;

/* Why a third-party call failed. */
export type ExternalApiFailure =
  /* The provider did not answer in time. */
  | "timeout"
  /* The provider could not be reached at all. */
  | "unreachable"
  /* The provider answered 4xx: our request was wrong. */
  | "rejected"
  /* The provider answered 5xx: it is broken on its side. */
  | "provider_error"
  /* The provider sent something we cannot read. */
  | "unreadable"
  /* The provider refused because we called it too often. */
  | "rate_limited";

export class ExternalApiError extends Error {
  constructor(
    public readonly failure: ExternalApiFailure,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ExternalApiError";
  }
}

interface FetchJsonOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/*
 Calls an API and returns its JSON body.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", ...options.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // AbortSignal.timeout raises a TimeoutError; everything else is a real
    // network failure.
    const isTimeout = (error as Error).name === "TimeoutError";
    throw new ExternalApiError(
      isTimeout ? "timeout" : "unreachable",
      isTimeout
        ? `The provider did not answer within ${timeoutMs} ms`
        : `Could not reach the provider: ${(error as Error).message}`
    );
  }

  if (response.status === 429) {
    // Its own failure: the service is being called too often. Widgets must
    // show this rather than pretend the data is missing.
    throw new ExternalApiError("rate_limited", "The provider rate-limited us", 429);
  }
  if (!response.ok) {
    const failure: ExternalApiFailure = response.status < 500 ? "rejected" : "provider_error";
    throw new ExternalApiError(failure, `The provider answered ${response.status}`, response.status);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new ExternalApiError("unreadable", "The provider's answer is not valid JSON");
  }
}

/*
 Calls an API and returns its body as text.
 */
export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const isTimeout = (error as Error).name === "TimeoutError";
    throw new ExternalApiError(
      isTimeout ? "timeout" : "unreachable",
      isTimeout
        ? `The provider did not answer within ${timeoutMs} ms`
        : `Could not reach the provider: ${(error as Error).message}`
    );
  }
  if (!response.ok) {
    const failure: ExternalApiFailure = response.status < 500 ? "rejected" : "provider_error";
    throw new ExternalApiError(failure, `The provider answered ${response.status}`, response.status);
  }
  return response.text();
}
