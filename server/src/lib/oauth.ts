import crypto from "crypto";
import { redis } from "./redis";
import type { OAuthConfig } from "../services/types";

// Generic OAuth 2.0 helper.

/*
 How long an authorization request stays valid..
 */
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 600;

/* Prefix of the Redis keys holding pending authorization requests. */
const STATE_KEY_PREFIX = "oauth:state:";

/*
 What we remember while the user is away on the provider's site.
 */
export interface AuthorizationRequest {
  userId: string;
  service: string;
  returnTo: string;
}

export interface AuthorizationRequestResult {
  authorizationUrl: string;
  state: string;
}

function stateKey(state: string): string {
  return `${STATE_KEY_PREFIX}${state}`;
}

/*
 Generates the anti-CSRF state.
 */
function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/*
 Fails early when a provider is misconfigured.
 */
function assertConfigIsComplete(service: string, config: OAuthConfig): void {
  const requiredFields = ["clientId", "clientSecret", "redirectUri", "authorizeUrl", "tokenUrl"] as const;
  const missingFields = requiredFields.filter((field) => !config[field]);

  if (missingFields.length > 0) {
    throw new Error(
      `OAuth configuration of "${service}" is incomplete: ${missingFields.join(", ")} missing. ` +
        `Check the corresponding variables in .env.`
    );
  }
}

/*
 Builds the provider's authorization URL.
 */
export function buildAuthorizationUrl(config: OAuthConfig, state: string): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/*
 Starts an authorization request: generates the state, stores it, returns
 the URL to redirect the browser to.
 */
export async function createAuthorizationRequest(
  config: OAuthConfig,
  request: AuthorizationRequest
): Promise<AuthorizationRequestResult> {
  assertConfigIsComplete(request.service, config);

  const state = generateState();
  await redis.set(
    stateKey(state),
    JSON.stringify(request),
    "EX",
    AUTHORIZATION_REQUEST_TTL_SECONDS
  );
  return { authorizationUrl: buildAuthorizationUrl(config, state), state };
}

/*
 Reads and destroys an authorization request. Returns null when the state is
 unknown, expired, or already used.
 */
export async function consumeAuthorizationState(
  state: string | undefined
): Promise<AuthorizationRequest | null> {
  // The state comes from the query string, so it can be missing, duplicated
  // (Express turns ?state=a&state=b into an array), or any length.
  if (typeof state !== "string" || !/^[0-9a-f]{64}$/.test(state)) {
    return null;
  }
  const storedRequest = await redis.getdel(stateKey(state));
  if (!storedRequest) {
    return null;
  }
  try {
    return JSON.parse(storedRequest) as AuthorizationRequest;
  } catch {
    // Unreadable value: treat it as no state at all rather than crash the
    // callback.
    return null;
  }
}
