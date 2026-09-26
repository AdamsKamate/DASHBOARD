# Synchronization point: connecting the front end to the real server

Documentation for **Phase 1 card 1.11**, the final card of the phase.

Objective: disconnect the mock and point the front end to the real server.

Validation criterion: **registration and login work end to end, for real.**

---

## 1. What this card actually verifies

This card adds almost no functionality. It **puts a Phase 0 decision to the
test**: write `API.md` before coding, and follow it on both sides.

If the contract was respected, the switch fits in one environment variable.
Otherwise, it reveals every place where the two halves of the project have
diverged, and the card takes hours instead of thirty minutes.

Result here: **no API call had to be rewritten**, and no page was modified. The
three required fixes all concerned areas that `API.md` did not cover.

---

## 2. How the switch works

```
   React page
       ¦
       ¦  api.auth.login({ email, password })
   lib/api.ts ---------- NEXT_PUBLIC_USE_MOCK ?
       ¦                    ¦
       ¦ true               ¦ false
  mock/handlers.ts      fetch("http://localhost:8080/auth/login",
  (browser)                { credentials: "include" })
```

The choice is made in one place, in `lib/api.ts`:

```ts
function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  return USE_MOCK ? mockRequest(...) : realRequest(...);
}
```

Pages call `api.auth.login`, never `fetch`. This is what makes the switch
transparent: if a single page used `fetch` directly, it would continue calling
the server even in mock mode, and card 1.6 would have been pointless.

---

## 3. Switching modes

```bash
cd ~/TECH3/G-WEB-500-PAR-5-1-dashboard-30

# 1. check the configuration
grep -E "CLIENT_URL|NEXT_PUBLIC_USE_MOCK" .env

# 2. switch modes
sed -i 's|^NEXT_PUBLIC_USE_MOCK=.*|NEXT_PUBLIC_USE_MOCK=false|' .env

# 3. recreate containers so they reload .env
docker-compose up -d --force-recreate server client_web
docker-compose logs -f server
```

`CLIENT_URL` must be `http://localhost:8081`.

Use `--force-recreate`, not `restart`: `restart` relaunches the process with
the configuration already loaded in memory, without rereading `.env`.

### Checking the active mode

The dashboard header displays a **`mock`** or **`serveur réel`** badge. This is
a development indicator and should be removed before final delivery.

---

## 4. The three fixes

### 4.1 The confirmation link pointed to the API

```ts
// before
const link = `${process.env.SERVER_URL}/auth/verify?token=${token}`;

// after
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:8081";
const link = `${clientUrl}/verify?token=${token}`;
```

`GET /auth/verify` is an API route: it returns JSON. A user clicking the email
button would have seen raw `{"message":"Account confirmed"}` in the browser.

The link now points to `/verify`, the front-end page, which calls the API itself
and displays a polished screen with a `Se connecter` button.

Two routes look similar and must not be confused:

| Route | Caller | Response |
|---|---|---|
| `localhost:8081/verify?token=` | User, from the email | A page |
| `localhost:8080/auth/verify?token=` | Front-end code | JSON |

The log fallback, used when SMTP is not configured, was aligned with the same
URL; otherwise the two test paths would diverge.

### 4.2 Express returned HTML for unknown routes

`/widgets`, `/widget-types`, and `/services` do not exist on the server yet:
they are empty routes reserved for Phase 2.

Express returns an **HTML page** such as `Cannot GET /widgets` by default. The
front end parses every response as JSON, while `API.md` defines one error
format: the two assumptions conflict.

```ts
app.use((req, res) => {
  res.status(404).json({ error: `Unknown route: ${req.method} ${req.path}` });
});
```

Declare this **last**, after all routers: Express tries handlers in order, so
this one runs only when nothing else has responded.

### 4.3 The dashboard treated this 404 as an outage

After a successful login, the screen displayed `Chargement impossible`, the
worst possible message because authentication had just worked.

```ts
function isNotImplementedYet(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
```

A `404` on these routes means “not implemented yet”, not “the system is down”.
The dashboard therefore displays an explanatory banner, and the authentication
flow remains demonstrable against the real server.

---

## 5. What worked on the first try

These points required **no fixes**: they came from the contract, and the
contract held.

| Item | Why it held |
|---|---|
| Request and response shapes | Defined in `API.md`, respected on both sides |
| Status codes (`400`, `401`, `403`, `409`) | The mock reproduced the server's codes exactly |
| Displayed error messages | Selected by HTTP status, never by response text |
| `httpOnly` cookie | The front end handles no token; the browser does |
| CORS | Fixed in card 1.9, before it was needed |
| `credentials: "include"` | Already present in `realRequest` since card 1.6 |

The last two points deserve mention: without them, the switch would have failed
in a confusing way. The browser would have blocked every API response **and
ignored its `Set-Cookie`**, producing a login that “succeeds” without ever
opening a session.

---

## 6. Modified files

| File | Change |
|---|---|
| `server/src/lib/mailer.ts` | Confirmation link points to the front end |
| `server/src/routes/auth.ts` | Log fallback aligned with the same URL |
| `server/src/index.ts` | Unknown-route handler returns JSON |
| `client_web/src/app/dashboard/page.tsx` | Controlled 404 degradation and mode badge |

No authentication page, API call, or type changed.

---

## 7. Tests

### Prerequisite

```bash
sed -i 's|^NEXT_PUBLIC_USE_MOCK=.*|NEXT_PUBLIC_USE_MOCK=false|' .env
docker-compose up -d --force-recreate server client_web
```

Open `http://localhost:8081/register` with **Ctrl+Shift+R**. The badge should
display **`serveur réel`**.

### The end-to-end flow

| # | Action | Expected |
|---|---|---|
| 1 | Create `vrai@test.dev` / `password123` | `Compte créé` |
| 2 | Open `http://localhost:8025` | The email is in MailHog |
| 3 | Log in before confirming | `Confirme ton compte...` (C3) |
| 4 | Click the button in the email | `/verify` page: `Ton compte est confirmé` |
| 5 | Log in | `/dashboard`, `Widgets indisponibles` banner |
| 6 | Reload (F5) | Still signed in: the cookie persists |
| 7 | Sign out, then open `/dashboard` | Redirected to `/login` |

Step 4 validates the first fix: the user lands on a real page, not JSON.

### Checking the database

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, is_verified, left(password_hash, 7) AS hash FROM users'
```

Expected: `is_verified = t` after confirmation and a hash beginning with
`$2b$10$`; the plain-text password must never appear.

### Checking the logs

```bash
docker-compose logs --tail=20 server
```

Expected: `[auth] account confirmed: vrai@test.dev`.

### Checking the cookie

Developer tools -> **Application** tab:

- **Cookies** -> `localhost:8081`: a `token` cookie with the **HttpOnly** column
  checked;
- **Local Storage**: no token.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Dashboard badge | `serveur réel` |
| 2 | Registration | Email received in MailHog |
| 3 | Login before confirmation | `403` (C3) |
| 4 | Email link | Confirmation page, not JSON |
| 5 | Login | Dashboard, widgets banner |
| 6 | Reload | Session preserved |
| 7 | Database | `is_verified = t`, bcrypt hash |
| 8 | Cookie | `httpOnly`, nothing in Local Storage |

---

## 8. Returning to mock mode

The widget routes do not exist on the server yet. To continue working on the
grid:

```bash
sed -i 's|^NEXT_PUBLIC_USE_MOCK=.*|NEXT_PUBLIC_USE_MOCK=true|' .env
docker-compose up -d --force-recreate client_web
```

The mock does not disappear after synchronization: it remains the front end's
working tool while the server lags behind it. It will still be used in Phase 2,
while the widget routes and OAuth are being written.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Badge still shows `mock` | `.env` was not reread | `docker-compose up -d --force-recreate client_web` |
| `CORS policy` in the console | Incorrect `CLIENT_URL` or missing CORS | Check `.env` and `server/src/index.ts` |
| Login “succeeds” but F5 signs out | Cookie rejected: CORS without `credentials` | Check `cors({ credentials: true })` |
| Raw JSON after clicking the email | `mailer.ts` was not fixed | Link must point to `CLIENT_URL/verify` |
| `Chargement impossible` after login | Dashboard not fixed | Apply `isNotImplementedYet` |
| `Unexpected token '<'` in the console | Express returns HTML for a 404 | Add the unknown-route handler |

---

## 10. A discrepancy found along the way

```
[db] registry synchronized: 1 service(s), 2 widget(s)
```

At startup, the server synchronizes only **one** service, while `/about.json`
declares **four**.

The reason is that `about.ts` contains hard-coded data from Phase 0, while only
`weatherService` is uncommented in `registry.ts`. The two sources diverge.

This is not a defect in this card, but it should be addressed in Phase 2:
`about.json` should iterate over the registry instead of listing services by
hand. It is also a question a jury may ask after seeing this log line.

---

## 11. What Phase 1 leaves in place

| Constraint | Status |
|---|---|
| C1: `docker-compose up` | Five containers |
| C2: `/about.json` on port 8080 | Format compliant with the subject |
| C3: Confirmation before access | `403` until the account is confirmed |
| C4: Authentication | JWT in an `httpOnly` cookie |
| C10: Instance CRUD | Add, move, resize, remove |
| C11: Two instances with distinct configurations | Visible on the dashboard |
| C13: Hashed passwords | bcrypt, cost 10 |

### Coming in Phase 2

| Item |
|---|
| OAuth2 implemented manually (GitHub, Google) |
| `/services`, `/widget-types`, and `/widgets` server routes |
| `about.json` generated from the registry |
| Display of real data in blocks |
| Reconfiguration of an existing widget |
