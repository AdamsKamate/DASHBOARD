# OAuth Callback and Library-Free Grid

Documentation for Phase 2, Card 2.2: generic callback route, state verification, exchanging code for a token; and removal of `react-grid-layout`, which is forbidden by the assignment.
Covers constraint C5: hand coded OAuth2, no OAuth libraries (Passport.js, NextAuth excluded), and the ban on pre-built drag-and-drop libraries.

## 1. Where this card fits in the OAuth flow

```text
 1. the user clicks "Link my GitHub account"
       ¦
 2.    ¦-> GET /oauth/github/authorize          <- THIS CARD
       ¦     generates a state, stores it, redirects to GitHub
       ¦
 3.    ¦-> the browser goes to github.com
              ¦
              ¦   the user logs in and accepts
              ¦
 4.    GitHub redirects to /oauth/github/callback?code=...&state=...
       ¦
 5.    ¦-> state verification                   <- THIS CARD
       ¦
 6.    ¦-> POST to the token endpoint           <- THIS CARD
       ¦     server-to-server, with the client_secret
       ¦
 7.    ¦->> token encryption and storage         <- next card
```

The previous card wrote the helper (state generation, authorization URL). This one adds the routes and the code exchange.

## 2. Files

| File | Action | Description |
| :--- | :--- | :--- |
| `server/src/routes/oauth.ts` | Created | The two routes |
| `server/src/lib/oauth.ts` | Completed | `exchangeCodeForTokens()` |
| `server/src/index.ts` | Modified | Mounts the router |
| `client_web/src/lib/dashboard/layout.ts` | Replaced | Hand-coded algorithms |
| `client_web/src/components/dashboard/WidgetGrid.tsx` | Replaced | Pointer Events |
| `client_web/src/components/dashboard/WidgetBlock.tsx` | Replaced | Keyboard handle |
| `client_web/src/app/globals.css` | Modified | Library styles removed |
| `client_web/package.json` | Modified | Dependency removed |

## 3. The two routes

**`GET /oauth/:service/authorize`**
Authenticated. It needs to know which account to link.
It responds with a 302 redirect to the provider: the browser navigates there. This is never consumed as JSON by the frontend.

```typescript
router.get("/oauth/:service/authorize", requireAuth, async (req, res) => {
  const provider = findOAuthProvider(req.params.service);
  const { authorizationUrl } = await createAuthorizationRequest(
    provider.getOAuthConfig!(),
    { userId: req.user!.userId, service: provider.name, returnTo: "/services" }
  );
  return res.redirect(authorizationUrl);
});
```

**`GET /oauth/:service/callback`**
Public, intentionally. The browser arrives here directly from the provider's domain. The user is identified by the state, not by the session.

## 4. The provider comes from the registry

```typescript
function findOAuthProvider(serviceName: string): ServiceProvider | undefined {
  const provider = registry.find((service) => service.name === serviceName);
  return provider?.requiresAuth && provider.getOAuthConfig ? provider : undefined;
}
```

No provider name is hardcoded in this file. The two routes work for GitHub, Google, and any service added later: you just need to write its `ServiceProvider` in `services/`.
The double check `requiresAuth && getOAuthConfig` filters out weather and RSS feeds, which have nothing to authorize. Without it, a call to `/oauth/weather/authorize` would crash on a missing `getOAuthConfig`.

## 5. State verification

This is the core security of this card. Three checks, in this order.

**Check 1 : the state exists and has never been used**
```typescript
const authorizationRequest = await consumeAuthorizationState(
  typeof state === "string" ? state : undefined
);

if (!authorizationRequest) {
  return res.redirect(frontendRedirect("/services", { error: "invalid_state" }));
}
```
It is verified before even looking at the code. A callback whose state is unknown to us triggers no exchange: the attack stops there.
`consumeAuthorizationState` uses `GETDEL`, which reads and deletes in a single Redis command. A state therefore cannot be replayed, even by two simultaneous callbacks.

**Check 2 :the state matches the correct service**
```typescript
if (authorizationRequest.service !== serviceName) {
  return res.redirect(frontendRedirect("/services", { error: "invalid_state" }));
}
```
A state issued for GitHub must not be usable on the Google callback. Without this check, an attacker could hijack a legitimate flow to another provider.

**Check 3 : the code is present**
```typescript
if (typeof code !== "string" || code.length === 0) {
  return res.redirect(frontendRedirect("/services", { error: "missing_code" }));
}
```
Express turns `?code=a&code=b` into an array. Without the type check, this array would be sent to the provider and cause an obscure error.

## 6. Code exchange

**The body is form-encoded, not JSON**
```typescript
const requestBody = new URLSearchParams({
  grant_type: "authorization_code",
  code,
  client_id: config.clientId,
  client_secret: config.clientSecret,
  redirect_uri: config.redirectUri,
});
```
The OAuth 2.0 specification requires it for this request, and providers reject a JSON body. This is a common mistake when coding OAuth by hand: sending JSON by reflex and getting a cryptic error from the provider.

**Why `redirect_uri` is repeated**
The provider already knows it : it received it during the authorization step. The specification requires it to be sent again, and providers use it as an additional check: the exchange must come from the same application as the authorization.

**The two response formats**
```typescript
if (contentType.includes("application/json")) { ... }
if (contentType.includes("application/x-www-form-urlencoded")) { ... }
```
Google responds in JSON. GitHub responds in form-encoded by default:
`access_token=gho_xxx&scope=repo&token_type=bearer`
The `Accept: application/json` header asks it for JSON, but the parser accepts both; and even guesses the format when a provider forgets its header. This makes the helper reusable for any provider added later.

**A 200 can contain an error**
```typescript
if (tokenResponse.error) {
  throw new OAuthExchangeError(
    `The provider refused the exchange: ${tokenResponse.error_description ?? tokenResponse.error}`,
    tokenResponse.error
  );
}
```
GitHub responds `200 OK` with `{"error":"bad_verification_code"}` in the body when the code has expired. Checking the HTTP status alone is not enough.

**The timeout**
`signal: AbortSignal.timeout(10_000)`
A provider that never responds would leave the user's browser stuck on our callback. Ten seconds, then a clear error.

**Expiration normalization**
```typescript
expiresAt: tokenResponse.expires_in
  ? new Date(Date.now() + tokenResponse.expires_in * 1000)
  : null,
```
Providers return `expires_in`, a number of seconds from now. Storing an absolute date turns the question "is this token expired?" into a simple comparison later in the project.
GitHub does not send an expiration: the field is `null`, which is a legitimate case, not an error.

## 7. No error returns JSON

`return res.redirect(frontendRedirect("/services", { error: "access_denied" }));`
The user arrives at the callback from GitHub, in their browser. They are a human, not code.
Every failure therefore redirects them back to the frontend with an error code in the URL:

| Code | Cause |
| :--- | :--- |
| `access_denied` | The user denied access on the provider |
| `invalid_state` | State unknown, expired, replayed, or for another service |
| `missing_code` | The provider did not return a code |
| `unknown_service` | Unknown service or missing OAuth configuration |
| `configuration` | Missing variables in the `.env` |
| `exchange_failed` | The provider refused the exchange |

The frontend will read this parameter to display an understandable message.

## 8. The token is never logged

```typescript
console.log(
  `[oauth] token obtained for user ${authorizationRequest.userId} on ${serviceName} ` +
    `(expires: ${tokens.expiresAt?.toISOString() ?? "never"}, ` +
    `refresh token: ${tokens.refreshToken ? "yes" : "no"})`
);
```
The log states that a token was obtained, for whom, and with what expiration : but never its value.
Server logs are read by more people than the database, and often kept longer. A token that appears there is a compromised token.
The error message also never contains the `client_secret`: a test explicitly checks for this.

## 9. The library-free grid

`react-grid-layout` is a ready-made drag-and-drop library, which is therefore forbidden. It was removed and replaced by custom code.

**What replaces it**

| What the library did | What replaces it |
| :--- | :--- |
| Drag | `onPointerDown` / `onPointerMove` / `onPointerUp` |
| Resize | A handle in the corner, same mechanics |
| Detect collisions | `itemsOverlap()` |
| Push blocks away | `pushOverlappingItemsDown()`, recursive |
| Fill gaps | `compactVertically()` |
| Stay in the grid | `clampToGrid()` |
| Measure width | `ResizeObserver` |

**Pointer Events, not Mouse Events**
`onPointerDown={...} onPointerMove={...} onPointerUp={...}`
A single API covers mouse, touch, and stylus. With `onMouseDown`, a second code path with `onTouchStart` would have been needed for phones.

**Pointer capture**
`(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);`
Without it, a fast drag that leaves the block stops receiving events: the block freezes mid-movement. The capture forces the browser to keep sending them to the origin element, wherever the cursor is.

**The order: push then compact**
```typescript
const resolvedItems = pushOverlappingItemsDown([...otherItems, movedItem], movedItem);
return compactVertically(resolvedItems);
```
This is the classic trap of this algorithm. Compacting first would move blocks up into the space the dragged block is about to occupy, and the push would happen too late.

**The push is recursive**
`resolvedItems = pushOverlappingItemsDown(resolvedItems, pushedItem);`
Pushing block B onto block C must also push C, otherwise two blocks end up on the same cells. A single pass is not enough.

**What we gain in the process**
Writing the drag logic ourselves allows for keyboard movement, which `react-grid-layout` doesn't support:

| Key | Effect |
| :--- | :--- |
| Tab | Focus the block header |
| Arrows | Move the block by one cell |
| Shift + Arrows | Resize |

The handle is a `<button>`, not a `<div>`: it is keyboard accessible and carries an `aria-label` announcing available keys. This is a strong point for accessibility constraint C12.

## 10. Installation

```bash
cd client_web
npm uninstall react-grid-layout @types/react-grid-layout
cd ..
```

Check that no trace remains:
```bash
grep -rn "react-grid-layout" client_web/src/ client_web/package.json
```
No output is expected.

```bash
docker-compose up -d --build server client_web
docker-compose exec server npx tsc --noEmit -p tsconfig.json
docker-compose exec client_web npx tsc --noEmit -p tsconfig.json
```
Both `tsc` commands must output nothing.

## 11. Tests

**The server starts**
`docker-compose logs --tail=15 server`
Expected:
```text
[migrate] database is up to date
[db] registry synchronized
[redis] connected, SET/GET self-test passed
Server listening on port 8080
```
Before this card, `routes/oauth.ts` was empty even though `index.ts` imported it: the server could not start.

**Another service's state**
Impossible to test without a registered provider, but the check is in place and covered by automated tests.

**The grid**
Window at least 1024px wide, in mock mode, logged in with `demo@dashboard.dev / password123`:

| Action | Expected |
| :--- | :--- |
| Drag a block by its header | It follows the cursor, a blue rectangle shows the destination |
| Drop on another block | The other block is pushed down |
| Reload (F5) | The position is retained |
| Drag the bottom - right corner | Resizes, minimum 2×2 |
| Delete a block | Those below move up |
| Tab then arrows | The block moves via keyboard |
| Tab then Shift + arrows | The block resizes via keyboard |
| Shrink below 1024px | Blocks are stacked, handles disabled |
The two bolded lines (keyboard accessibility) are new: they were not possible with the library.

**Summary**

| # | Test | Expected |
| :--- | :--- | :--- |
| 1 | Server start | `Server listening on port 8080` |
| 2 | `/oauth/github/authorize` without session | `401` |
| 3 | Callback with unknown state | Redirect `error=invalid_state` |
| 4 | No trace of the library | Empty `grep` |
| 5 | Server and frontend compilation | No errors |
| 6 | Drag, resize, delete | Grid responds |
| 7 | Keyboard movement | Block moves |

`lib/crypto.ts` is still empty. The token is currently fetched and then lost: the next card will encrypt it and write it to the database, making the account linkage truly persistent.
