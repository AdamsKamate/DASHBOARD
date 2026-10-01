import { refreshAccessToken, OAuthRefreshError } from "./oauth";
import { registry } from "../services/registry";
import {
  findSubscription,
  linkService,
  isTokenExpired,
  ServiceSubscription,
} from "../db/repositories/userServices";

// Getting a token that actually works.

/* Why a token could not be provided. */
export type TokenUnavailableReason =
  /* The user never linked this service. */
  | "not_linked"
  /* The token expired and no refresh token was stored (GitHub-style). */
  | "expired_without_refresh"
  /* The refresh token itself was rejected: the user must authorize again. */
  | "refresh_rejected"
  /* The provider could not be reached. */
  | "provider_unreachable"
  /* Unknown service, or a service that does not use OAuth. */
  | "unknown_service";

export class TokenUnavailableError extends Error {
  constructor(
    public readonly reason: TokenUnavailableReason,
    message: string
  ) {
    super(message);
    this.name = "TokenUnavailableError";
  }
}

/*
 Refreshes a subscription and stores the new tokens.
 */
async function refreshSubscription(
  subscription: ServiceSubscription
): Promise<string> {
  const provider = registry.find((service) => service.name === subscription.serviceId);
  if (!provider?.getOAuthConfig) {
    throw new TokenUnavailableError(
      "unknown_service",
      `Service "${subscription.serviceId}" is unknown or does not use OAuth`
    );
  }
  if (!subscription.refreshToken) {
    throw new TokenUnavailableError(
      "expired_without_refresh",
      `The ${subscription.serviceId} token expired and no refresh token is stored`
    );
  }
  let newTokens;
  try {
    newTokens = await refreshAccessToken(provider.getOAuthConfig(), subscription.refreshToken);
  } catch (error) {
    if (error instanceof OAuthRefreshError) {
      // A refused refresh is final: the user revoked the access, or changed
      // their password. Only a new authorization can fix it.
      const refused = error.providerError === "invalid_grant";
      throw new TokenUnavailableError(
        refused ? "refresh_rejected" : "provider_unreachable",
        error.message
      );
    }
    throw error;
  }

  await linkService(subscription.userId, subscription.serviceId, {
    accessToken: newTokens.accessToken,
    // Keep the existing refresh token when the provider sends none.
    refreshToken: newTokens.refreshToken ?? subscription.refreshToken,
    expiresAt: newTokens.expiresAt,
  });
  console.log(
    `[oauth] ${subscription.serviceId} token refreshed for user ${subscription.userId} ` +
      `(new expiry: ${newTokens.expiresAt?.toISOString() ?? "never"})`
  );
  return newTokens.accessToken;
}

/**
 * Returns a usable access token for this user and this service.
 *
 * Refreshes it first when needed. Throws TokenUnavailableError when no token
 * can be provided, with a reason the caller can act on: a widget turns it
 * into an "error" status, a route into an HTTP code.
 */
export async function getValidAccessToken(
  userId: string,
  serviceId: string
): Promise<string> {
  const subscription = await findSubscription(userId, serviceId);

  if (!subscription) {
    throw new TokenUnavailableError(
      "not_linked",
      `User ${userId} has not linked ${serviceId}`
    );
  }
  // isTokenExpired keeps a one-minute margin, so a token cannot expire
  // between this check and the API call that follows.
  if (!isTokenExpired(subscription)) {
    return subscription.accessToken;
  }

  return refreshSubscription(subscription);
}

/*
 Message to show the user for each reason.
 */
export function describeTokenFailure(reason: TokenUnavailableReason): string {
  switch (reason) {
    case "not_linked":
      return "Ce service n'est pas lié à ton compte.";
    case "expired_without_refresh":
    case "refresh_rejected":
      return "L'autorisation a expiré : relie ton compte pour continuer.";
    case "provider_unreachable":
      return "Le service est momentanément injoignable.";
    case "unknown_service":
      return "Service inconnu.";
  }
}
