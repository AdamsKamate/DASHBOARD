import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { registry } from "../services/registry";
import {
  createAuthorizationRequest,
  consumeAuthorizationState,
  exchangeCodeForTokens,
  OAuthExchangeError,
} from "../lib/oauth";
import { linkService } from "../db/repositories/userServices";
import type { ServiceProvider } from "../services/types";

const router = Router();

// OAuth 2.0 routes, shared by every provider.
const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:8081";

/* Where the user lands once the flow ends, successfully or not. */
function frontendRedirect(path: string, params: Record<string, string>): string {
  const url = new URL(path, CLIENT_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/*
 Finds a provider that actually supports OAuth.
 */
function findOAuthProvider(serviceName: string): ServiceProvider | undefined {
  const provider = registry.find((service) => service.name === serviceName);
  return provider?.requiresAuth && provider.getOAuthConfig ? provider : undefined;
}

/*
 GET /oauth/:service/authorize
 */
router.get("/oauth/:service/authorize", requireAuth, async (req: Request, res: Response) => {
  const serviceName = req.params.service;
  const provider = findOAuthProvider(serviceName);
  if (!provider) {
    return res.redirect(frontendRedirect("/services", { error: "unknown_service" }));
  }
  try {
    const { authorizationUrl } = await createAuthorizationRequest(provider.getOAuthConfig!(), {
      userId: req.user!.userId,
      service: provider.name,
      returnTo: "/services",
    });
    return res.redirect(authorizationUrl);
  } catch (error) {
    // Incomplete configuration, or Redis unavailable. The message names the
    // missing variables; it stays in our logs, never in the redirect.
    console.error(`[oauth] could not start the ${serviceName} flow:`, (error as Error).message);
    return res.redirect(frontendRedirect("/services", { error: "configuration" }));
  }
});

/*
 GET /oauth/:service/callback
 */
router.get("/oauth/:service/callback", async (req: Request, res: Response) => {
  const serviceName = req.params.service;
  const { code, state, error: providerError } = req.query;
  // 1. The user refused, or the provider failed on its side.
  if (providerError) {
    console.warn(`[oauth] ${serviceName} refused the authorization: ${providerError}`);
    return res.redirect(frontendRedirect("/services", { error: "access_denied" }));
  }
  // 2. The state is checked before anything else
  const authorizationRequest = await consumeAuthorizationState(
    typeof state === "string" ? state : undefined
  );
  if (!authorizationRequest) {
    console.warn(`[oauth] ${serviceName} callback with an invalid or expired state`);
    return res.redirect(frontendRedirect("/services", { error: "invalid_state" }));
  }

  // 3. The state remembers which service was requested. A state issued for
  // GitHub must not be usable on the Google callback.
  if (authorizationRequest.service !== serviceName) {
    console.warn(
      `[oauth] state issued for ${authorizationRequest.service}, used on ${serviceName}`
    );
    return res.redirect(frontendRedirect("/services", { error: "invalid_state" }));
  }
  if (typeof code !== "string" || code.length === 0) {
    return res.redirect(frontendRedirect("/services", { error: "missing_code" }));
  }
  const provider = findOAuthProvider(serviceName);
  if (!provider) {
    return res.redirect(frontendRedirect("/services", { error: "unknown_service" }));
  }

  // 4. Exchange, server to server. 
  try {
    const tokens = await exchangeCodeForTokens(provider.getOAuthConfig!(), code);
    // 5. Store the link.
    await linkService(authorizationRequest.userId, serviceName, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    // Never log the token itself: server logs are readable by more people
    // than the database, and a leaked token grants access to the account.
    console.log(
      `[oauth] ${serviceName} linked to user ${authorizationRequest.userId} ` +
        `(expires: ${tokens.expiresAt?.toISOString() ?? "never"}, ` +
        `refresh token: ${tokens.refreshToken ? "yes" : "no"})`
    );
    return res.redirect(
      frontendRedirect(authorizationRequest.returnTo, { linked: serviceName })
    );
  } catch (error) {
    if (error instanceof OAuthExchangeError) {
      console.error(`[oauth] exchange failed on ${serviceName}:`, error.message);
      return res.redirect(frontendRedirect("/services", { error: "exchange_failed" }));
    }
    console.error(`[oauth] unexpected error on ${serviceName}:`, (error as Error).message);
    return res.redirect(frontendRedirect("/services", { error: "unexpected" }));
  }
});

export default router;
