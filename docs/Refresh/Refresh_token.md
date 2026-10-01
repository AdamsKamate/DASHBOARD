# Automatic Refresh of an Expired Token

Documentation for **Phase 2 card 2.4**: expiration detection and calling the
provider's refresh endpoint.

Validation criterion: **a widget continues to work after the initial token expires.**

---

## 1. The Problem

Google issues access tokens that are valid for **one hour**. After that time,
any request to the Calendar or Gmail API returns `401`.

Without refresh, the scenario would be:

```
10:00 AM  the user links their Google account
10:05 AM  their Calendar and Gmail widgets work
11:01 AM  they display an error
           the user has to click « Lier mon compte » again
```

This is **not acceptable** for a dashboard that is supposed to run without
intervention.

## 2. What OAuth Provides

When the account is linked, the provider sends two tokens:

| Token | Lifetime | Purpose |
|---|---|---|
| `access_token` | 1 hour with Google | Call the API |
| `refresh_token` | Until revoked | Obtain a new access token |

The refresh token makes it possible to obtain a new access token **without
asking the user for authorization again**. This provides durable access while
keeping access tokens short-lived: if one leaks, it can be exploited for only
one hour.

**GitHub does not work this way**: its tokens do not expire and no refresh token
is sent. The code must handle both cases.

---

## 3. Files

| File | Role |
|---|---|
| `server/src/lib/oauth.ts` | **Completed**: `refreshAccessToken()` |
| `server/src/lib/tokenProvider.ts` | **Created**: `getValidAccessToken()` |

`tokenProvider.ts` is the module that widgets will call in Phases 2 and 3.

---

## 4. A Single Entry Point

```ts
const accessToken = await getValidAccessToken(userId, "google");
```

This function returns a **guaranteed usable** token: either one that is still
valid or one that has just been refreshed.

A dedicated module is preferable to a check in every widget: a widget that
forgot to refresh would fail one hour after linking, and the bug might only
appear in production. With a single entry point, the rule cannot be bypassed.

## 5. Detecting Expiration

```ts
export function isTokenExpired(subscription: ServiceSubscription): boolean {
  if (!subscription.expiresAt) {
    return false;          // GitHub : pas d'expiration
  }
  const oneMinuteFromNow = Date.now() + 60_000;
  return subscription.expiresAt.getTime() <= oneMinuteFromNow;
}
```

Written in the previous card, this function becomes useful here.

The **one-minute margin** is the detail that prevents a rare but real bug:
without it, a token expiring in two seconds could pass the check and then
expire **during** the API call that follows. The widget would fail for no
apparent reason, and only occasionally.

**A token without an expiration is never refreshed.** This is GitHub's case:
`expiresAt` is `null`, the function returns `false`, and the token is used as-is.

---

## 6. The Refresh Request

```ts
const requestBody = new URLSearchParams({
  grant_type: "refresh_token",
  refresh_token: refreshToken,
  client_id: config.clientId,
  client_secret: config.clientSecret,
});
```

The endpoint is the same as for the initial exchange, but:

| | Initial exchange | Refresh |
|---|---|---|
| `grant_type` | `authorization_code` | `refresh_token` |
| Token sent | `code` | `refresh_token` |
| `redirect_uri` | Required | **Absent** |

The `redirect_uri` has no purpose here: no browser is involved; this is a
purely server-to-server exchange.

The `client_secret` is sent as in the initial exchange and never leaves the
container.

---

## 7. The Refresh Token Trap

This is the most delicate point in the card.

```ts
await linkService(subscription.userId, subscription.serviceId, {
  accessToken: newTokens.accessToken,
  // Keep the existing refresh token when the provider sends none.
  refreshToken: newTokens.refreshToken ?? subscription.refreshToken,
  expiresAt: newTokens.expiresAt,
});
```

**Most providers do not return a new refresh token**: the original one remains
valid indefinitely.

Naively writing `refreshToken: newTokens.refreshToken` would therefore replace
the existing refresh token with `null`. As a result, the first refresh would
succeed, the second would be impossible, and the user would have to link their
account again an hour later, exactly the problem we wanted to solve.

The `??` keeps the old token when the provider sends none, and uses the new one
when it does (some providers rotate refresh tokens).

---

## 8. Failure Causes

```ts
export type TokenUnavailableReason =
  | "not_linked"
  | "expired_without_refresh"
  | "refresh_rejected"
  | "provider_unreachable"
  | "unknown_service";
```

Not all errors require the same action from the user:

| Reason | Cause | Message displayed |
|---|---|---|
| `not_linked` | The account has never been linked | Ce service n'est pas lié à ton compte. |
| `expired_without_refresh` | Expired, with no refresh token stored | L'autorisation a expiré : relie ton compte. |
| `refresh_rejected` | The user revoked access | L'autorisation a expiré : relie ton compte. |
| `provider_unreachable` | GitHub or Google is down | Le service est momentanément injoignable. |
| `unknown_service` | Unknown service or one without OAuth | Service inconnu. |

**The important distinction**: the first two and the third require user action.
`provider_unreachable` is temporary and will resolve during the next refresh
cycle; there is no reason to ask the user to relink their account because of a
ten-minute outage at Google.

### `invalid_grant`, the Permanent Case

```ts
const refused = error.providerError === "invalid_grant";
```

This error code means that **the refresh token itself is no longer valid**:
the user revoked access in the provider's settings or changed their password.
No retry will succeed; only a new authorization can resolve the situation.

Distinguishing this from a network outage avoids two mistakes: bothering the
user about a temporary outage, or retrying a permanently invalid token forever.

---

## 9. Tests

### Installation

```bash
docker-compose exec server npx tsc --noEmit -p tsconfig.json
docker-compose up -d --force-recreate server
docker-compose logs --tail=10 server
```

### Why It Cannot Yet Be Tested in the Browser

No OAuth provider is registered in `registry.ts`; GitHub and Google arrive with
their respective cards. There is therefore no token to refresh yet.

The mechanism is nevertheless implemented, compiled, and covered by 39
automated checks.

### Test Scenarios

| # | Situation | Expected |
|---|---|---|
| 1 | Token is still valid | Returned as-is, **no network call** |
| 2 | Token is expired | New token obtained automatically |
| 3 | After refresh | New token is stored, encrypted |
| 4 | Provider is silent about refresh | Existing refresh token is preserved |
| 5 | Second refresh | Still possible |
| 6 | Expires in 30 seconds | Refreshed in advance |
| 7 | Token without expiration (GitHub) | Never refreshed |
| 8 | Service is not linked | `not_linked` |
| 9 | Expired without a refresh token | `expired_without_refresh` |
| 10 | Access revoked | `refresh_rejected` |
| 11 | Provider is down | `provider_unreachable` |

Points **4 and 5** are the most important: they verify that the overwritten
refresh-token trap is avoided.

**The widget must have displayed its data normally**: this is the card's
criterion.

### Google and the Missing Refresh Token

A Google-specific trap: it sends a refresh token only on the **first**
authorization. If the user links an already authorized account, the response
does not contain one.

## 11. Likely Questions

**Why use expiring tokens if they can be refreshed automatically?**
Because a leaked access token can be exploited for only one hour. The refresh
token never travels to the APIs: it remains encrypted in the database and is
only sent in the provider endpoint request.

**What happens if two widgets request a token at the same time?**
Both trigger a refresh, and the second overwrites the first. Both tokens remain
valid with the provider, so nothing breaks. A Redis lock would eliminate the
redundant call; this is a possible optimization, not a required fix.

**Why does GitHub not need any of this?**
Its tokens do not expire: they remain valid until revoked. `expiresAt` is `null`,
`isTokenExpired` returns `false`, and the refresh path is never taken.

**What if refresh fails while the user is viewing the dashboard?**
The widget enters an `error` state with a message appropriate to the cause.
Other widgets continue to work: a Google outage does not affect the weather
widget.

---

## 12. What Remains to Be Done

| Item | Card |
|---|---|
| GitHub provider: first real call to `getValidAccessToken` | 2.5 |
| Google provider, with `access_type=offline` | 2.6 |
| Widgets using the tokens | Phase 2 |
| Redis lock for concurrent refreshes | Out of scope |

`getValidAccessToken()` is implemented and tested but is not called anywhere
yet: it is waiting for the first widget that needs a token.
