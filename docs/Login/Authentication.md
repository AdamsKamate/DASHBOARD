# Login, JWT, and Route Protection

Documentation for **Phase 1 title 1.4**. This document explains how a user logs
in, how the token is issued and verified, and how private routes are protected.

Covers constraints **C3** (an unconfirmed account cannot access the platform),
**C4** (authentication), and **C13** (sensitive data).

---

## 1. Overview

```
POST /auth/login
  │
  ├> find user by email                             repositories/users.ts
  │
  ├> compare password (bcrypt)                      lib/password.ts
  │      failure -> 401 Invalid credentials
  │
  ├> check is_verified                               C3
  │      unconfirmed account -> 403 Account not confirmed
  │
  ├> sign token                                      lib/jwt.ts
  │
  ├> set httpOnly cookie
  │
  └> 200 { token, user }


          every request to a private route
                        v
              requireAuth middleware                    middleware/auth.ts
  │
  ├> extract token (cookie, then Authorization header)
  │      missing -> 401 Authentication required
  │
  ├> verify signature and expiration
  │      invalid -> 401 Invalid or expired token
  │
  └> set req.user and execute the route
```

---

## 2. Relevant Files

| File | Purpose |
|---|---|
| `server/src/lib/jwt.ts` | Token signing and verification |
| `server/src/middleware/auth.ts` | `requireAuth`, `requireAdmin`, `optionalAuth` |
| `server/src/routes/auth.ts` | `/auth/login`, `/auth/me`, `/auth/logout` |
| `server/src/index.ts` | Mounts `cookie-parser` |
| `server/src/lib/password.ts` | `verifyPassword()`, implemented in card 1.2 |

---

## 3. Why a JWT Instead of a Server Session

| Criterion | Server session | JWT |
|---|---|---|
| Storage | Session store (Redis, database) | None, the state lives in the token |
| Immediate revocation | Possible | **Impossible before expiry** |
| Separate front end and API | Requires shared cookie configuration | Natural |
| Scaling | The store becomes a contention point | No shared state |

The project has two distinct services: the Next.js front end on port 8081 and
the API on port 8080. A token travels naturally between them, whereas a shared
session would require adding a store and configuring it.

The trade-off is real: **a JWT cannot be revoked**. Logging a user out does not
invalidate their token, it only removes the browser cookie. This is precisely
why the lifetime is kept short.

### Token Lifetime

```ts
const EXPIRES_IN = "7d";
```

Seven days is a compromise: long enough to avoid logging in again at every
work session, short enough that a stolen token stops working quickly.

A stricter system would use a short access token (15 minutes) paired with a
refresh token. This is deliberately out of scope: the assignment asks for
authentication, not a complete session lifecycle, and warns against
over-engineering.

---

## 4. Token Contents

```ts
export interface JwtPayload {
  userId: string;
  email: string;
  role: "user" | "admin";
}
```

**A JWT payload is base64-encoded, and therefore readable by anyone.** The
signature guarantees that it has not been modified, not that it is secret.

This can be verified directly:

```bash
echo "<the middle part of the token>" | base64 -d
```

The direct consequence is that **sensitive data never belongs in a token**. No
password, no hash, no OAuth token. Only what is needed to identify the user
and decide their permissions.

### The Algorithm

```ts
jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
```

The `algorithms` option is **essential during verification**. Without it, an
attacker can forge a token signed with the `none` algorithm and impersonate
anyone: this is the best-known vulnerability in JWT implementations.

HS256 is a symmetric signature, the same key signs and verifies. This is
sufficient here since only our server issues and validates tokens. An
asymmetric signature (RS256) would be useful if a third-party service had to
verify our tokens without being able to issue them.

### The Mandatory Secret

```ts
if (!secret) {
  throw new Error("JWT_SECRET missing. Generate one: openssl rand -hex 32");
}
```

The module refuses to load without a key, so **the server does not start**.
This is deliberate: a server that fails to start is better than a server
signing tokens with an empty key, which anyone could then forge.

---

## 5. The Login Route

### Constant Timing

```ts
const passwordMatches = user
  ? await verifyPassword(password, user.password_hash)
  : await verifyPassword(password, DUMMY_HASH);
```

This is the least obvious point in the file. If we returned `401` immediately
when the email is unknown, without calling bcrypt, the response would be
measurably faster (roughly 60 ms of difference) than with a wrong password.

An attacker timing the responses could then determine which addresses are
registered, without ever guessing a single password. We therefore compare
against a dummy hash to make both branches cost the same.

### The Same Message in Both Cases

```ts
if (!user || !passwordMatches) {
  return res.status(401).json({ error: "Invalid credentials" });
}
```

"Unknown email" and "incorrect password" return exactly the same response.
Distinguishing them would be more convenient for the user, but would turn the
login page into an account enumeration tool.

### Check Order

The `is_verified` check comes **after** the password check:

```ts
if (!user.is_verified) {
  return res.status(403).json({ error: "Account not confirmed" });
}
```

The reverse would leak information: someone entering a random address would
get `403` if the account exists but is unconfirmed, and `401` otherwise, which
is account enumeration again.

Status `403` rather than `401` is intentional: the user is correctly
identified, but is not allowed to access the platform. A `401` would suggest
re-entering credentials, which would change nothing.

### Token in the Body AND in a Cookie

```ts
res.cookie("token", token, COOKIE_OPTIONS);
return res.status(200).json({ token, user: { ... } });
```

Both are provided because they serve different clients:

| Transport | Client | Benefit |
|---|---|---|
| `httpOnly` cookie | Browser | Unreadable by JavaScript, so protected against XSS theft |
| JSON body | curl, Postman, mobile client | Essential for testing the API from the command line |

### Cookie Options

```ts
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
```

| Option | Purpose |
|---|---|
| `httpOnly` | Page JavaScript cannot read the cookie: an XSS flaw cannot steal the token |
| `sameSite: lax` | The cookie is not sent on a POST request coming from another site: CSRF protection |
| `secure` | HTTPS only. Disabled in development, where the server runs over HTTP |
| `maxAge` | Aligned with the token lifetime, to avoid a cookie that exists but is unusable |

---

## 6. The Middleware

### Two Token Sources

```ts
function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.token;
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  return null;
}
```

The cookie takes priority because it is the browser case, the most common in
production. The `Authorization` header remains accepted for clients that do
not handle cookies.

### Extending the Request Type

```ts
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
```

Without this declaration, TypeScript would reject `req.user`, since the
Express definition does not know that field. We extend its interface rather
than casting to `any` at every use, which would discard the benefit of typing.

### Usage

```ts
// Private route
router.get("/widgets", requireAuth, handler);

// Administrator-only route
router.get("/admin/users", requireAuth, requireAdmin, handler);
```

`requireAdmin` is **always used after** `requireAuth`. It nevertheless returns
`401` if `req.user` is absent, which protects against a mounting mistake: if
someone forgets `requireAuth`, the route closes rather than opening.

### Status Codes

| Situation | Code | Message |
|---|---|---|
| No token | `401` | `Authentication required` |
| Invalid, forged, or expired token | `401` | `Invalid or expired token` |
| Valid token, insufficient role | `403` | `Insufficient permissions` |

An expired token and a forged token return the same message: distinguishing
them would tell an attacker whether what they are testing is valid.

---

## 7. `/auth/me` Queries the Database

```ts
const user = await findUserById(req.user!.userId);
if (!user) {
  return res.status(401).json({ error: "Invalid or expired token" });
}
```

The route could rely on the token payload alone, which is already verified. It
queries the database anyway, for two reasons:

- a role may have changed since the token was issued, so a demoted user would
  otherwise keep administrator rights until expiry;
- an account may have been deleted, so its token would otherwise keep working.

This is the counterpart to JWTs being non-revocable: sensitive routes
re-check the actual state instead of trusting the token.

---

## 8. Logout

```ts
router.post("/auth/logout", (_req, res) => {
  const { maxAge, ...clearOptions } = COOKIE_OPTIONS;
  res.clearCookie("token", clearOptions);
  return res.status(204).send();
});
```

**Logging out does not invalidate the token.** It only removes the browser
cookie. A token copied before logout keeps working until it expires.

This is an inherent JWT limitation, to be acknowledged rather than hidden.
Working around it would require a revocation list in the database or in cache,
which would remove the benefit of being stateless.

`maxAge` is deliberately omitted: `clearCookie` sets a past expiry date
itself, and passing it is deprecated in Express 5. The other options, however,
must match those used when the cookie was set, otherwise the browser keeps it.

---

## 9. Tests

### Prerequisite

The server does not start if `JWT_SECRET` is missing:

```bash
grep JWT_SECRET .env
# if empty:
sed -i "s|^JWT_SECRET=$|JWT_SECRET=$(openssl rand -hex 32)|" .env
docker-compose up -d --force-recreate server
```

### 1. Unconfirmed Account (C3)

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"login@test.com","password":"password123"}'

curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"login@test.com","password":"password123"}'
```

Expected: `403 {"error":"Account not confirmed"}`, with no token.

### 2. Login After Confirmation

Confirm the account through `http://localhost:8025`, then:

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"login@test.com","password":"password123"}'
```

Expected: `200` with `token` and `user`. The `user` field contains **neither**
`password_hash` **nor** `verification_token`.

### 3. Card Validation Criterion

```bash
curl http://localhost:8080/auth/me
```

Expected: `401 {"error":"Authentication required"}`

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"login@test.com","password":"password123"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl http://localhost:8080/auth/me -H "Authorization: Bearer $TOKEN"
```

Expected: `200` with `id`, `email`, and `role`.

### 4. Invalid Credentials

```bash
# wrong password
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"login@test.com","password":"wrong"}'

# non-existent email
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"unknown@test.com","password":"password123"}'
```

Expected: `401 {"error":"Invalid credentials"}` in **both** cases, with a
comparable response time.

### 5. Forged Token

```bash
curl http://localhost:8080/auth/me -H "Authorization: Bearer not.a.jwt"
```

Expected: `401 {"error":"Invalid or expired token"}`

### 6. Token Through a Cookie

```bash
curl http://localhost:8080/auth/me --cookie "token=$TOKEN"
```

Expected: `200`. The middleware accepts both transports.

### 7. Inspect the Token Contents

```bash
echo "$TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null
```

Expected:

```json
{"userId":"...","email":"login@test.com","role":"user","iat":...,"exp":...}
```

Check that `exp - iat` equals `604800` (seven days) and that **no password or
hash** appears. This command also demonstrates that a JWT payload is readable
by anyone.

### 8. Logout

```bash
curl -i -X POST http://localhost:8080/auth/logout
```

Expected: `204`, with a `Set-Cookie: token=;` header and an expiry date in
1970.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Login, unconfirmed account | `403 Account not confirmed` |
| 2 | Login, confirmed account | `200` + token, no hash |
| 3 | Protected route without token | `401 Authentication required` |
| 3 | Protected route with token | `200` |
| 4 | Wrong password / unknown email | `401`, same message |
| 5 | Forged token | `401 Invalid or expired token` |
| 6 | Token through a cookie | `200` |
| 7 | Token contents | `userId`, `email`, `role`, 7 days, no secret |
| 8 | Logout | `204`, cookie cleared |

---

## 10. Troubleshooting

**`curl: (56) Recv failure`**: the server is not listening. The cause is
always in the logs:

```bash
docker-compose logs server | tail -20
```

The two causes encountered so far:

| Message | Cause | Fix |
|---|---|---|
| `JWT_SECRET missing` | Empty key in `.env` | Generate the key, then `up -d --force-recreate` |
| `Cannot find module 'cookie-parser'` | Dependency absent from the image | `docker-compose up -d --build server` |

**Docker command reminder**

| What changed | Command |
|---|---|
| Source code (`src/`) | Nothing, `ts-node-dev` reloads on its own |
| `.env` | `up -d --force-recreate` |
| `package.json` | `up -d --build` |
| `Dockerfile` | `up -d --build` |

---

## 11. Remaining Work

The middleware is written but **used only on `/auth/me`**. In Phase 2, every
route handling user data must carry it:

```ts
router.get("/services", requireAuth, handler);
router.get("/widgets", requireAuth, handler);
router.get("/oauth/:service/authorize", requireAuth, handler);
```

`requireAdmin` will be used by the administration section, in Phase 3.

| Item | Card |
|---|---|
| Protecting the services and widgets routes | Phase 2 |
| Administration section (`requireAdmin`) | Phase 3 |
| Refresh token | Out of scope |
| Token revocation list | Out of scope |