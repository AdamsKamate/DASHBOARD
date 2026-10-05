import crypto from "crypto";
import { redis } from "./redis";
import type { OAuthConfig } from "../services/types";

// Generic OAuth 2.0 helper

/*
 How long an authorization request stays valid
 */
export const AUTHORIZATION_REQUEST_TTL_SECONDS = 600;

/* Prefix of the Redis keys holding pending authorization requests */
const STATE_KEY_PREFIX = "oauth:state:";

/*
 What we remember while the user is away on the provider's site
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
 Generates the anti-CSRF state
 */
function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/*
 Fails early when a provider is misconfigured
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
 Builds the provider's authorization URL
 */
export function buildAuthorizationUrl(config: OAuthConfig, state: string): string {
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  // Provider-specific additions, set last so a provider can override a
  // default if it ever needs to
  for (const [name, value] of Object.entries(config.extraAuthorizationParams ?? {})) {
    url.searchParams.set(name, value);
  }

  return url.toString();
}

/*
 Starts an authorization request: generates the state, stores it, returns
 the URL to redirect the browser to
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
 unknown, expired, or already used
 */
export async function consumeAuthorizationState(
  state: string | undefined
): Promise<AuthorizationRequest | null> {
  // The state comes from the query string, so it can be missing, duplicated
  // (Express turns ?state=a&state=b into an array), or any length
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
    // callback
    return null;
  }
}

// Second half of the flow: exchanging the code for a token

/* What the provider gives back, normalised across providers */
export interface OAuthTokens {
  accessToken: string;
  /* Absent from GitHub, present on Google */
  refreshToken: string | null;
  /* Computed from expires_in; null when the token does not expire */
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string;
}

/* Raw answer of a token endpoint, before normalisation */
interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/* Fails the exchange without ever carrying the token or the secret */
export class OAuthExchangeError extends Error {
  constructor(message: string, public readonly providerError?: string) {
    super(message);
    this.name = "OAuthExchangeError";
  }
}

/*
 The exchange must not hang forever: a provider that never answers would
 keep the user's browser waiting on our callback
 */
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

/*
 Reads the answer of a token endpoint
 */
async function parseTokenResponse(response: Response): Promise<TokenEndpointResponse> {
  const rawBody = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawBody) as TokenEndpointResponse;
    } catch {
      throw new OAuthExchangeError("The provider returned an unreadable JSON body");
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody)) as TokenEndpointResponse;
  }
  // Unknown content type: try JSON first, then form encoding, rather than
  // giving up on a provider that simply forgot its header
  try {
    return JSON.parse(rawBody) as TokenEndpointResponse;
  } catch {
    return Object.fromEntries(new URLSearchParams(rawBody)) as TokenEndpointResponse;
  }
}

/*
 Exchanges an authorization code for a token
 */
export async function exchangeCodeForTokens(
  config: OAuthConfig,
  code: string
): Promise<OAuthTokens> {
  const requestBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    // Sent again even though the provider already knows it
    redirect_uri: config.redirectUri,
  });

  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // GitHub answers form encoded by default; this asks for JSON.
        Accept: "application/json",
      },
      body: requestBody.toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Network failure or timeout
    throw new OAuthExchangeError(
      `Could not reach the token endpoint: ${(error as Error).message}`
    );
  }
  const tokenResponse = await parseTokenResponse(response);

  // A provider can answer 200 with an error field in the body: checking the
  // HTTP status alone is not enough
  if (tokenResponse.error) {
    throw new OAuthExchangeError(
      `The provider refused the exchange: ${tokenResponse.error_description ?? tokenResponse.error}`,
      tokenResponse.error
    );
  }
  if (!response.ok) {
    throw new OAuthExchangeError(`The token endpoint answered ${response.status}`);
  }
  if (!tokenResponse.access_token) {
    throw new OAuthExchangeError("The provider's answer contains no access token");
  }
  return {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? null,
    // expires_in is a number of seconds from now
    expiresAt: tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null,
    scope: tokenResponse.scope ?? null,
    tokenType: tokenResponse.token_type ?? "bearer",
  };
}

// Refreshing an expired token

/* Raised when the refresh fails and the user must authorize again */
export class OAuthRefreshError extends Error {
  constructor(message: string, public readonly providerError?: string) {
    super(message);
    this.name = "OAuthRefreshError";
  }
}

/*
 Obtains a new access token from a refresh token
 */
export async function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string
): Promise<OAuthTokens> {
  const requestBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: requestBody.toString(),
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OAuthRefreshError(
      `Could not reach the token endpoint: ${(error as Error).message}`
    );
  }

  const tokenResponse = await parseTokenResponse(response);

  if (tokenResponse.error) {
    // invalid_grant means the refresh token itself is dead: the user revoked
    // the access, or changed their password
    throw new OAuthRefreshError(
      `The provider refused the refresh: ${tokenResponse.error_description ?? tokenResponse.error}`,
      tokenResponse.error
    );
  }

  if (!response.ok) {
    throw new OAuthRefreshError(`The token endpoint answered ${response.status}`);
  }

  if (!tokenResponse.access_token) {
    throw new OAuthRefreshError("The provider's answer contains no access token");
  }

  return {
    accessToken: tokenResponse.access_token,
    // Most providers do NOT send a new refresh token: the old one stays
    // valid
    refreshToken: tokenResponse.refresh_token ?? null,
    expiresAt: tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000)
      : null,
    scope: tokenResponse.scope ?? null,
    tokenType: tokenResponse.token_type ?? "bearer",
  };
}
