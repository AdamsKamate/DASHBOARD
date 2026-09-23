# API Mock: Developing the Frontend Without the Server

Documentation for **Phase 1 card 1.6**. This document explains how the
frontend can be developed entirely without the real server, why this approach
was chosen, and how to switch to the real server.

Validation criterion: **the frontend can be developed entirely without the
real server existing.**

---

## 1. Why Use a Mock

The project divides the work between two people:

| Person | Scope |
|---|---|
| A | Server: database, authentication, OAuth, Timer |
| B | Frontend: pages, forms, widget grid |

Without a mock, Person B would have to wait for each server route before
coding the corresponding page. The project would progress at the pace of the
slower side.

The mock reproduces `API.md` route by route, directly in the browser. Person B
builds pages against it without waiting. The `API.md` contract is the only
dependency between both sides: as long as both sides follow it, the final
connection is just a switch.

---

## 2. Overview

```
   React page
       ¦
       ¦  api.auth.login({ email, password })
       ¦
   lib/api.ts - NEXT_PUBLIC_USE_MOCK ?
       ¦                    ¦
       ¦ false              ¦ true
   fetch()              lib/mock/handlers.ts
   http://localhost:8080      ¦
   (real server)              ¦
                         lib/mock/db.ts
                         (in-memory state + localStorage)
```

Pages communicate **only with `api.ts`**. They do not need to know which mode
they are running in.

---

## 3. Created, Modified, and Deleted Files

### Summary

| File | Action |
|---|---|
| `client_web/src/lib/types.ts` | Created |
| `client_web/src/lib/api.ts` | Replaced |
| `client_web/src/lib/mock/db.ts` | Created |
| `client_web/src/lib/mock/handlers.ts` | Created |
| `client_web/src/app/dev/page.tsx` | Created |
| `client_web/src/app/about.ts` | **Deleted** |
| `docker-compose.yml` | Modified |
| `.env.example` | Modified |
| `API.md` | Corrected |

### `client_web/src/lib/types.ts`: created

**The frontend copy of the `API.md` contract.** Every JSON response documented
in `API.md` has its TypeScript type here: `CurrentUser`, `LoginResponse`,
`Service`, `WidgetType`, `WidgetInstance`, `WidgetData`, `AdminUser`, and so on.

It serves two purposes:

- pages know exactly which fields they receive, with editor autocomplete;
- if `API.md` changes, this file is updated and **the compiler identifies every
  page that needs updating**, instead of discovering the issue at runtime.

It contains no logic, only type declarations.

### `client_web/src/lib/api.ts`: replaced

**The only module allowed to communicate with the server.** The previous
version exposed a generic `apiFetch(path)` function; the new version exposes an
`api` object with one typed function per route:

```ts
api.auth.login({ email, password })     // -> LoginResponse
api.widgets.create({ widgetTypeId, ... }) // -> WidgetInstance
```

It contains:

| Element | Purpose |
|---|---|
| `USE_MOCK` | Reads `NEXT_PUBLIC_USE_MOCK` and selects the mode |
| `ApiError` | Error containing the HTTP status, message, and `details` |
| `mockRequest()` | Calls the mock with simulated latency |
| `realRequest()` | Calls the real server with `fetch`, including cookies |
| `request()` | Routes to one or the other according to `USE_MOCK` |
| `api` | Typed functions, one for each `API.md` route |

The `api.services.link()` function deserves special mention: OAuth is not a
`fetch` call but a **full-page navigation** to the provider. In real mode it
redirects the browser to the server; in mock mode it links the account
immediately and redirects to `/services?linked=...`, the same page as the real
callback.

### `client_web/src/lib/mock/db.ts`: created

**The mock database.** This is the in-memory equivalent of what PostgreSQL
contains on the real server.

| Element | Purpose |
|---|---|
| `SERVICES` | The 4 services from `docs/Services/Services.md` |
| `WIDGET_TYPES` | The 8 widgets, each with its parameters |
| `seed()` | Demo accounts and widgets |
| `db` | Current state: users, widgets, subscriptions, session |
| `persist()` | Saves state to `localStorage` |
| `resetMock()` | Restores the initial data |
| `newId()` | Generates a random identifier |

`sessionUserId` plays the role of the `httpOnly` cookie: it stores which user
is logged in.

`persist()` does nothing on the server, where `window` does not exist. The mock
therefore remains usable even when Next.js executes code outside the browser.

### `client_web/src/lib/mock/handlers.ts`: created

**The `API.md` routes reproduced one by one.** This is the core of the mock.

The file is organized into layers:

| Part | Contents |
|---|---|
| Response builders | `successResponse`, `errorResponse`, `noContentResponse`, `redirectResponse` |
| Session | `withAuth` and `withAdmin`, equivalents of the server-side `requireAuth` and `requireAdmin` |
| Lookup | `findService`, `findWidgetType`, `findUserWidget`, `isSubscribed` |
| Validation | Same rules as the server: email, password, parameters, `refreshRate` |
| Fake data | `generateFakeData()`, a plausible response for each widget type |
| Handlers | One `handleXxx` function per route |
| Route table | Method, path, and handler list |
| Dispatch | `matchPattern()` and `handle()` |

The route table can be read at a glance:

```ts
{ method: "POST",  pattern: "/widgets",     handler: withAuth(handleCreateWidget) },
{ method: "PATCH", pattern: "/widgets/:id", handler: withAuth(handleUpdateWidget) },
```

`matchPattern()` extracts URL parameters: applying `"/widgets/:id/data"` to
`"/widgets/w-12/data"` returns `{ id: "w-12" }`.

`handle()` is the only entry point, called by `api.ts`. A route missing from
the table returns an explicit `404` (`No mock route for ...`), immediately
revealing a call missing from the contract.

### `client_web/src/app/dev/page.tsx`: created

**A contract verification page**, available at
`http://localhost:8081/dev`. It runs 23 checks covering every route family
and displays the result line by line, with the active mode in the header.

It uses only `api.ts`, never the mock directly. Therefore, it tests exactly
what the real pages will use.

This is a development tool and should be removed or moved to `bonus/` before
the final submission.

### `client_web/src/app/about.ts`: deleted

This file contained **Express server code** for the `/about.json` route,
which had been copied into the frontend directory by mistake. Since `express`
is not installed in `client_web`, it would have caused the Next.js build to
fail.

The real `/about.json` route remains in `server/src/routes/about.ts`.

### `docker-compose.yml`: modified

Two variables were added to the `client_web` service:

```yaml
- NEXT_PUBLIC_USE_MOCK=${NEXT_PUBLIC_USE_MOCK:-true}
- NEXT_PUBLIC_MOCK_LATENCY=${NEXT_PUBLIC_MOCK_LATENCY:-300}
```

This is essential: `client_web` has no `env_file`, so a variable from `.env`
reaches the container **only if it is listed here**.

### `.env.example`: modified

Documents the two new variables so that anyone cloning the project knows that
they exist and what they do.

### `API.md`: corrected

Building the mock required reviewing the contract route by route, which
revealed differences from the server. They were corrected and listed in the
"Change Log" section at the end of `API.md`:

| Correction | Reason |
|---|---|
| `github_commits` parameter renamed from `number` to `count` | The server and `Services.md` already used `count` |
| `details` field added to the error format | The server returns it for validation errors |
| `POST /auth/logout` marked public | The server does not require a token |
| Missing `400` and `404` codes added | Returned by the server but absent from the contract |
| Document fully translated into English | It mixed French and English |

The first point was **blocking**: the `github_commits` configuration form would
have sent a field the server does not expect. It illustrates the value of the
mock: contract differences appear during development, not when connecting the
systems.

An "Implementation Status" table was also added, indicating for each route
whether it is already implemented on the server and in the mock.

---

## 4. Choosing the Approach

Three options were considered:

| Criterion | Static JSON | MSW | **Client-integrated mock** |
|---|---|---|---|
| No dependency added | Yes | No | **Yes** |
| Handles state (registration, created widgets) | No | Yes | **Yes** |
| Works with the Next.js App Router | Yes | Complicated configuration | **Yes** |
| Works during server rendering | Yes | No | **Yes** |
| Switches to the real server | Rewrite calls | Disable the worker | **One variable** |

### Why Not Static JSON

A JSON file always returns the same response. The frontend must test stateful
flows: creating an account, seeing it rejected until confirmed, adding a
widget, and finding it in the list. A fixed JSON file cannot support this.

### Why Not MSW

MSW (Mock Service Worker) intercepts network requests through a *service worker*
registered in the browser. It is an excellent tool, but:

- the worker must be registered when the application starts, which is delicate
  with the Next.js App Router;
- it intercepts nothing during server rendering, where no service worker exists;
- it adds a dependency and a generated file in `public/`.

### The Chosen Approach

The mock is connected **inside the API client itself**. When
`NEXT_PUBLIC_USE_MOCK=true`, `api.ts` calls the mock handlers instead of
`fetch`. There is no dependency, no service worker, and switching to the real
server requires only one environment variable.

---

## 5. The API Client

### One Entry Point

```ts
api.auth.register({ email, password })
api.auth.login({ email, password })
api.widgets.list()
api.widgets.create({ widgetTypeId, params, refreshRate })
api.widgets.data(widgetId)
```

**Pages never call `fetch` directly.** This makes switching transparent: if
one page used `fetch`, it would continue calling the real server even in mock
mode.

### Typed Errors

```ts
try {
  await api.auth.login({ email, password });
} catch (error) {
  if (error instanceof ApiError && error.status === 403) {
    // unconfirmed account: display "check your mailbox"
  }
}
```

`ApiError` carries the HTTP status, message, and validation error details.
Pages react to the **status** (`401`, `403`, `409`), never to the message text,
which may change.

### Simulated Latency

```ts
const MOCK_LATENCY_MS = Number(process.env.NEXT_PUBLIC_MOCK_LATENCY ?? 300);
```

Every mock call waits 300 ms. Without this delay, responses would be
instantaneous: loading states such as spinners and disabled buttons would
never be visible during development, and their bugs would appear only when the
real server was connected.

### Copies, Never References

```ts
const response = handle(method, path, JSON.parse(JSON.stringify(body)));
```

Incoming and outgoing data passes through JSON serialization, just as it would
on the network. Without this, a page modifying a received object would modify
the mock's internal state directly, a bug that would not exist with the real
server.

### Lazy Loading

```ts
const { handle } = await import("./mock/handlers");
```

The mock is loaded only when it is used. In real-server mode, it is never
included in the code sent to the browser.

---

## 6. What the Mock Reproduces

### The Session

The real server sets an `httpOnly` cookie at login. The mock simulates this
cookie with `db.sessionUserId`: after `login`, protected routes recognize the
user exactly as they would with the real cookie.

A page therefore never has to manage a token itself in either mode.

### Server Rules

| Rule | Mock behavior |
|---|---|
| Email already used, case-insensitive | `409` |
| Malformed email, password < 8 characters | `400` with `details` |
| Unconfirmed account at login (C3) | `403 Account not confirmed` |
| Wrong password or unknown email | `401`, same message |
| Confirmation link already used | `400` |
| Protected route without a session | `401 Authentication required` |
| Admin route with a `user` role | `403 Insufficient permissions` |
| Missing or incorrectly typed widget parameter | `400` |
| `refreshRate` below 30 seconds | `400` |
| Widget from an unsubscribed service | `403` |
| Widget owned by another user | `404` |
| Service without authentication (weather, RSS) | Subscribed by default |

The mock intentionally reproduces **the same messages** as the server. A page
that handles mock errors correctly will handle server errors correctly.

### Persistence

The mock state is saved in the browser's `localStorage` after every change.
Reloading the page does not log the user out or clear the dashboard.

To start over, run this in the browser console:

```js
resetMock()
```

---

## 7. Demo Data

### Accounts

All accounts use the password `password123`.

| Email | Role | Used to test |
|---|---|---|
| `demo@dashboard.dev` | `user` | Normal flow, two Paris/Tokyo widgets, subscribed GitHub |
| `admin@dashboard.dev` | `admin` | Administration section |
| `pending@dashboard.dev` | `user` | Unconfirmed account, rejected login (C3) |

The two widgets belonging to `demo@dashboard.dev` are instances of the **same**
type (`city_temperature`) with different cities. They directly illustrate the
assignment's C11 constraint.

### Services and Widgets

The mock exposes the **4 services and 8 widgets** defined in
`docs/Services/Services.md`, each with at least one configurable parameter.

### Two Behaviors for Testing the Interface

According to `API.md`, a widget has three possible states: `ok`, `pending`, and
`error`. The mock can produce each state:

| To obtain | Do this |
|---|---|
| `pending` | Read a widget's data **immediately after creating** or reconfiguring it |
| `ok` | Read it a second time |
| `error` | Set a parameter to **`"error"`**, for example `city: "error"` |

This is essential for the widget grid: an errored widget must never break the
display of the others, and this case must be reproducible on demand.

### Confirmation Link

The real server sends the link by email. The mock displays it in the
**browser console**:

```
[mock] verification link for user@example.com: /auth/verify?token=verify-a1b2c3d4
```

---

## 8. Configuration

In `docker-compose.yml`, under the `client_web` service:

```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://localhost:8080
  - NEXT_PUBLIC_USE_MOCK=${NEXT_PUBLIC_USE_MOCK:-true}
  - NEXT_PUBLIC_MOCK_LATENCY=${NEXT_PUBLIC_MOCK_LATENCY:-300}
```

The `${NEXT_PUBLIC_USE_MOCK:-true}` syntax reads the value from `.env` and
uses `true` when it is absent.

**Important:** unlike the `server` service, `client_web` has no
`env_file: .env`. A variable added to `.env` reaches the container **only if it
is listed here**.

| Variable | Values | Effect |
|---|---|---|
| `NEXT_PUBLIC_USE_MOCK` | `true` / `false` | Mock or real server |
| `NEXT_PUBLIC_MOCK_LATENCY` | milliseconds | Simulated mock delay |

The `NEXT_PUBLIC_` prefix is required by Next.js: only variables with this
prefix are available to code running in the browser.

### Switch to the Real Server

This is the purpose of the synchronization card. In `.env`:

```bash
NEXT_PUBLIC_USE_MOCK=false
```

Then:

```bash
docker-compose up -d --force-recreate client_web
```

**No page needs to be modified.**

---

## 9. The `/dev` Verification Page

`http://localhost:8081/dev` runs every contract route from the browser and
displays the result line by line.

It displays the active mode at the top: `mock` or `real server`.

This is a **development tool** and should be removed or moved to `bonus/`
before the final submission.

---

## 10. Tests

### 1. Verify That the Mock Is Active

```bash
docker-compose exec client_web printenv | grep NEXT_PUBLIC
```

Expected:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_USE_MOCK=true
NEXT_PUBLIC_MOCK_LATENCY=300
```

### 2. Card Criterion: Without the Server

```bash
docker-compose stop server
```

Open `http://localhost:8081/dev` and reload with **Ctrl+Shift+R**.

Expected: `Mode: mock` and `23 / 23 passed`.

Because the server is stopped, this result proves that the frontend works
entirely without it.

```bash
docker-compose start server
```

### 3. Real Mode for Comparison

With `NEXT_PUBLIC_USE_MOCK=false` and the server stopped, the page displays
`Mode: real server` and `Failed to fetch`. This is expected: the frontend calls
the real server, which is not responding.

### 4. Persistence

Log in as `demo@dashboard.dev` from a page and reload it: the user should
remain logged in.

### 5. Reset

In the browser console:

```js
resetMock()
```

Reload the page: the demo accounts and widgets are restored.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Variables in the container | `NEXT_PUBLIC_USE_MOCK=true` |
| 2 | `/dev` with the server stopped | `Mode: mock`, `23 / 23 passed` |
| 3 | Real mode with the server stopped | `Failed to fetch` (normal) |
| 4 | Page reload | Session is preserved |
| 5 | `resetMock()` | Demo data restored |

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Mode: real server` while `.env` says `true` | Variable missing from the `client_web` block | Add it to `environment` in `docker-compose.yml` |
| `mapping key "build" already defined` | `client_web:` indented by 4 spaces instead of 2 | Align it with `server:`, then run `docker-compose config --quiet` |
| Compilation error involving `express` | `client_web/src/app/about.ts` is present | Delete the file; it contains server code |
| Page still displays the old mode | Browser cache | Reload with **Ctrl+Shift+R** |
| Inconsistent data after changing the mock | Old state in `localStorage` | Run `resetMock()` in the console |

After every manual change to `docker-compose.yml`, run:

```bash
docker-compose config --quiet && echo "Valid YAML"
```

---

## 12. Maintenance Rules

**The mock follows `API.md`, never the other way around.** If a route changes
in the contract, `types.ts` and `handlers.ts` must be updated in the same
commit. A mock that diverges from the contract would reveal the mismatch when
the systems are connected, which is the worst possible time.

**A new route must be declared in two places**:

1. a `handleXxx` function in `handlers.ts`;
2. a line in the `routes` table at the bottom of the same file.

**A new service or widget** must be added to `SERVICES` and `WIDGET_TYPES` in
`db.ts`, then to `generateFakeData()` so it has demo data.
