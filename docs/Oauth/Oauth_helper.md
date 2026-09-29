# Generic OAuth Helper

Documentation for **Phase 2, card 2.1**: a reusable function for all OAuth
providers; generation of the anti-CSRF `state` (protecting the application
against forged requests sent to the server without the user's knowledge) and
construction of the authorization URL.

This covers requirement **C5** of the assignment: OAuth2 implemented by hand.
**No OAuth library is allowed** (Passport.js and NextAuth are excluded).

---

## 1. Where This Card Fits in the OAuth Flow

```
 1. the user clicks "Link my GitHub account"
       ¦
 2.    ¦> createAuthorizationRequest()        <- THIS CARD
       ¦     generates a state, stores it in Redis,
       ¦     builds the authorization URL
       ¦
 3.    ¦> browser redirects to GitHub
       ¦      ¦
       ¦      ¦   the user signs in and accepts
       ¦      ¦
 4.    GitHub redirects to our callback: ?code=...&state=...
       ¦
 5.    ¦> consumeAuthorizationState()         <- THIS CARD
       ¦     verifies that this state was issued by us
       ¦
 6.    ¦> exchange the code for a token       <- next card
       ¦      then encrypt and store it in the database
```

This card therefore covers **steps 2 and 5**: starting the flow and securing
the callback. Code exchange is implemented in the GitHub card.

---

## 2. Why a Generic Helper

The project provides two OAuth services, GitHub and Google, and the assignment
requires an extensible architecture.

Without a helper, the code for generating the `state`, storing it, validating
it, and building the URL would be duplicated for every provider. A security
fix would then have to be applied in several places, and forgetting one would
be easy.

Here, **adding a provider only requires writing its configuration**:

```ts
export const githubService: ServiceProvider = {
  name: "github",
  requiresAuth: true,
  getOAuthConfig: () => ({
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    redirectUri: process.env.GITHUB_REDIRECT_URI!,
    scope: "repo read:user",
  }),
  widgets: [...],
};
```

No line in `lib/oauth.ts` needs to change.

---

## 3. Files

| File | Role |
|---|---|
| `server/src/lib/oauth.ts` | The helper |
| `server/scripts/check-oauth.ts` | Verification script against the real Redis instance |

The helper relies on two existing components: `services/types.ts` for the
`OAuthConfig` interface (Phase 0) and `lib/redis.ts` for storage (card 1.5).

---

## 4. What the Helper Exposes

| Function | Role |
|---|---|
| `createAuthorizationRequest(config, request)` | Generates the `state`, stores it, and returns the URL |
| `consumeAuthorizationState(state)` | Reads and deletes the `state`: the anti-CSRF check |
| `buildAuthorizationUrl(config, state)` | Builds the URL only |

`buildAuthorizationUrl` is exposed separately so URL construction can be
tested without touching Redis.

---

## 5. The `state`: What It Really Does

### The Attack Without `state`

1. The attacker starts an OAuth flow using **their** GitHub account and
  intercepts their own `code` instead of letting the flow complete.
2. They send the victim a link to **our** callback containing that `code`.
3. The victim, logged in to their dashboard, clicks the link.
4. Our server exchanges the code, obtains a token **for the attacker's
  GitHub account**, and links it to the victim's account.
5. The victim now sees the attacker's repositories, and anything they add via
  this service goes through an account they do not control.

### What `state` Adds

The `state` proves that the callback **answers a request initiated by us for
this specific user**. A callback containing a `state` we never issued is
rejected before any code exchange.

That is exactly what `consumeAuthorizationState` does: if Redis does not know
this `state`, the function returns `null` and the flow stops.

---

## 6. Generating the `state`

```ts
function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}
```

`crypto.randomBytes` uses the operating system's cryptographically secure
random number generator.

**`Math.random()` would be a vulnerability here.** Its output is predictable:
an attacker able to guess a `state` could bypass exactly the protection that
`state` provides. A cryptographic random generator is required.

32 bytes produce 64 hexadecimal characters, or 2^256 possibilities.

---

## 7. Storing the `state`

```ts
await redis.set(stateKey(state), JSON.stringify(request), "EX", 600);
```

### Redis Instead of Process Memory

An in-memory `Map` would be simpler, but it would be **cleared every time the
server restarts**. During development, `ts-node-dev` restarts whenever a file
is saved: the user would return from GitHub with a `state` the server had
forgotten, and the flow would fail for no apparent reason.

Redis provides three benefits:

| Benefit | Detail |
|---|---|
| Survives restarts | The state remains valid while the server reloads |
| Automatic expiration | `EX 600`: no cleanup task is needed |
| Atomic operation | `GETDEL` guarantees single use |

### The 10-Minute Expiration

This is long enough to read the consent screen and sign in to the provider if
needed. A longer duration would leave usable `state` values around after an
abandoned attempt; a shorter one could frustrate hesitant users.

### What Is Stored with the `state`

```ts
export interface AuthorizationRequest {
  userId: string;
  service: string;
  returnTo: string;
}
```

The callback is a simple browser GET: it carries no context beyond the cookie.
Storing the `userId` when the request starts tells us **which account to link**
even if the cookie is missing, which can happen when the user returns in a
different tab.

`returnTo` lets us send the user back to where they started instead of a
generic home page.

---

## 8. `GETDEL`: Single Use

```ts
const storedRequest = await redis.getdel(stateKey(state));
```

This is the most subtle detail in the file.

Avec deux commandes séparées :

```ts
const value = await redis.get(key);
await redis.del(key);
```

two simultaneous callbacks carrying the same `state` could both execute `(1)`
before either one reaches `(2)`. Both would pass the check.

`GETDEL` reads **and** deletes the key in one Redis command, atomically. Only
one of the two calls receives a value; the other receives `null`.

The verification script proves this by starting two consumptions in parallel.

---

## 9. Building the URL

```ts
const url = new URL(config.authorizeUrl);
url.searchParams.set("client_id", config.clientId);
url.searchParams.set("redirect_uri", config.redirectUri);
url.searchParams.set("scope", config.scope);
url.searchParams.set("state", state);
url.searchParams.set("response_type", "code");
```

### `URLSearchParams` Instead of Concatenation

A scope such as `repo read:user` must be encoded when transmitted:

```
scope=repo+read%3Auser
```

Building the URL by hand fails silently: the provider returns "invalid scope"
without explaining why, and the cause is an unencoded space. `URLSearchParams`
handles this for every provider; the Google scope, which contains two complete
URLs, also works without special treatment.

### `response_type=code`

This is the **authorization code flow**. The provider returns a short-lived
code that our server exchanges for a token **server to server**.

The historical alternative, `response_type=token`, returned the token directly
in the browser URL: visible in browser history, in intermediary server logs,
and readable by any script on the page. It is now deprecated.

### The `client_secret` Never Appears

The authorization URL travels through the user's browser. Only the
`client_id` appears there; it is public by nature. The `client_secret` is used
only for the server-to-server code exchange.

---

## 10. Configuration Validation

```ts
function assertConfigIsComplete(service: string, config: OAuthConfig): void {
  const requiredFields = ["clientId", "clientSecret", "redirectUri", "authorizeUrl", "tokenUrl"] as const;
  const missingFields = requiredFields.filter((field) => !config[field]);

  if (missingFields.length > 0) {
    throw new Error(
      `OAuth configuration of "${service}" is incomplete: ${missingFields.join(", ")} missing. ...`
    );
  }
}
```

Without this check, an empty `client_id` would send the user to GitHub, which
would display **its own error page**. The user would see a broken screen on
GitHub's domain, while the actual cause would be a missing variable in our
`.env`.

Failing early with a message naming the missing fields and pointing to `.env`
saves considerable development time.

---

## 11. Validating the Received `state` Format

```ts
if (typeof state !== "string" || !/^[0-9a-f]{64}$/.test(state)) {
  return null;
}
```

The `state` comes from the query string: it may be missing, duplicated
(Express turns `?state=a&state=b` into an **array**), or any length.

Without this check, an array would be passed to Redis and cause a type error
instead of a clean rejection. The assignment requires all input to be
validated; URL parameters are input too.

---

## 12. Testing

### Run the Check

```bash
docker-compose exec server npx ts-node scripts/check-oauth.ts
```

The script runs against the project's **real Redis** instance: nothing is
mocked, and the `state` values actually pass through Redis. This is what makes
the single-use check meaningful.

### Check Redis Manually

While the server is running, pending `state` values can be inspected with:

```bash
docker-compose exec redis redis-cli KEYS 'oauth:state:*'
docker-compose exec redis redis-cli TTL 'oauth:state:<the-state>'
```

After a complete OAuth flow, the list should be empty: every `state` is
consumed by the callback, and abandoned states expire automatically after 10
minutes.

### Three Checks to Remember

| Check | What it proves |
|---|---|
| "another provider, with no provider-specific code" | The helper is genuinely generic |
| "reusing the same state: rejected" | Single use works |
| "only one of two calls receives the request" | `GETDEL` is atomic |

---

## 13. An Intentional Exclusion: PKCE

**PKCE** (Proof Key for Code Exchange) is an OAuth 2.0 extension that protects
the code exchange: the client sends a one-time secret when requesting
authorization, then proves it during the exchange.

It is not implemented here, deliberately.

PKCE targets **public clients**: mobile applications, single-page
applications, and anything that cannot keep a secret. Their `client_secret`
would be readable in the distributed code and would therefore be useless.

Our server is a **confidential client**: the code exchange happens server to
server, and the `client_secret` never leaves the container. `state` is enough
to cover the relevant risk here.

---

## 15. Remaining Work

| Item | Card |
|---|---|
| Exchange the code for a token | 2.2 |
| Encrypt tokens (`lib/crypto.ts`, currently empty) | 2.2 |
| Routes `/oauth/:service/authorize` and `/callback` | 2.2 |
| GitHub provider | 2.2 |
| Google provider | 2.3 |
| Refresh expired tokens | Phase 2 |

`lib/crypto.ts` is empty: AES-GCM token encryption (requirement C13) arrives
with the next card, when there is a token to store.