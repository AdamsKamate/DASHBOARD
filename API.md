# API Contract: Dashboard

This document is the **source of truth** between the backend and the frontend.
Every route used by the frontend must be defined here **before** it is coded.

The frontend mock (`client_web/src/lib/mock/handlers.ts`) reproduces this
document route by route. When a route changes here, the server and the mock
change in the same commit.

Base URL: `http://localhost:8080`

---

## Conventions

### Authentication

A JWT, sent either:

- in an `httpOnly` cookie named `token`, set by `POST /auth/login` (browsers);
- or in the header `Authorization: Bearer <token>` (curl, Postman).

Routes marked **Authenticated** answer `401` without a valid token.
Routes marked **Admin** additionally answer `403` when the role is not `admin`.

### Status codes

| Code | Meaning |
|---|---|
| `200` | Success with a body |
| `201` | Resource created |
| `204` | Success without a body |
| `302` | Redirect (OAuth routes only) |
| `400` | Invalid request (missing or incorrectly typed field) |
| `401` | Not authenticated (missing, invalid, or expired token) |
| `403` | Authenticated but not allowed (unconfirmed account, missing role, unsubscribed service) |
| `404` | Resource not found, or not owned by the current user |
| `409` | Conflict (email already in use) |
| `500` | Unexpected server error |

### Error format

Every failing route returns the same shape:

```json
{ "error": "human readable message" }
```

Validation errors (`400`) add the list of problems:

```json
{
  "error": "Invalid input",
  "details": ["email format is invalid", "password must be at least 8 characters"]
}
```

The frontend must branch on the **status code**, never on the message text.

### Authenticated routes: common errors

Not repeated below for each route:

| Code | Body |
|---|---|
| `401` | `{ "error": "Authentication required" }` when no token is sent |
| `401` | `{ "error": "Invalid or expired token" }` when the token is forged or expired |

---

## 1. Endpoint Required by the Assignment

### `GET /about.json`

Public, no authentication. Format strictly imposed by the assignment.

**`200` response**

```json
{
  "client": {
    "host": "10.101.53.35"
  },
  "server": {
    "current_time": 1531680780,
    "services": [
      {
        "name": "weather",
        "widgets": [
          {
            "name": "city_temperature",
            "description": "Display temperature for a city",
            "params": [
              { "name": "city", "type": "string" }
            ]
          }
        ]
      }
    ]
  }
}
```

- `client.host`: IPv4 of the client, without the `::ffff:` prefix
- `server.current_time`: Unix timestamp in **seconds**
- `params[].type`: only `"string"` or `"integer"`

---

## 2. Authentication

### `POST /auth/register`

Public. Creates an unconfirmed account and sends the confirmation email.

**Request**

```json
{ "email": "user@example.com", "password": "password123" }
```

- `email` is normalized to lowercase before storage
- `password`: 8 characters minimum, 72 bytes maximum (bcrypt limit)

**`201` response**

```json
{ "message": "Account created, email confirmation required" }
```

**Errors**

| Code | Body |
|---|---|
| `400` | `{ "error": "Invalid input", "details": [...] }` |
| `409` | `{ "error": "Email already in use" }`, case-insensitive |

---

### `GET /auth/verify?token=<verification_token>`

Public. Confirms the account through the link received by email. The link
works **only once**.

**`200` response**

```json
{ "message": "Account confirmed" }
```

**Errors**

| Code | Body |
|---|---|
| `400` | `{ "error": "Invalid or expired token" }` for an unknown, already used, or missing token |

---

### `POST /auth/login`

Public. Checks the credentials, then that the account is confirmed (C3), then
sets the `token` cookie.

**Request**

```json
{ "email": "user@example.com", "password": "password123" }
```

**`200` response**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "user" }
}
```

The response also sets the `token` cookie (`httpOnly`, `SameSite=Lax`, 7 days).

**Errors**

| Code | Body |
|---|---|
| `400` | `{ "error": "Email and password are required" }` |
| `401` | `{ "error": "Invalid credentials" }`, same message for an unknown email and a wrong password |
| `403` | `{ "error": "Account not confirmed" }` |

---

### `GET /auth/me`

**Authenticated.** Returns the current user.

**`200` response**

```json
{ "id": "uuid", "email": "user@example.com", "role": "user" }
```

---

### `POST /auth/logout`

Public. Clears the `token` cookie. Answers `204` even when no cookie is sent.

The JWT itself stays valid until it expires: a JWT cannot be revoked.

**`204` response**: no body.

---

## 3. Services and OAuth

### `GET /services`

**Authenticated.** Lists the available services and the subscription state of
the current user.

**`200` response**

```json
[
  { "name": "weather", "requiresAuth": false, "subscribed": true },
  { "name": "rss",     "requiresAuth": false, "subscribed": true },
  { "name": "github",  "requiresAuth": true,  "subscribed": false },
  { "name": "google",  "requiresAuth": true,  "subscribed": true }
]
```

`subscribed` is always `true` for a service with `requiresAuth: false`:
such services are available by default to every authenticated user, as
required by the assignment.

---

### `GET /oauth/:service/authorize`

**Authenticated.** Redirects (`302`) to the provider's authorization page.

The frontend does not consume JSON here: it performs a full page navigation
(`api.services.link(service)` on the client side).

---

### `GET /oauth/:service/callback?code=...&state=...`

Called by the provider, never by the frontend. The server checks the `state`,
exchanges the code for a token, encrypts it, stores it, then redirects
(`302`) to:

```
{CLIENT_URL}/services?linked={service}
```

On failure:

```
{CLIENT_URL}/services?error={reason}
```

---

### `DELETE /services/:service/subscription`

**Authenticated.** Unlinks the third-party account and deletes the stored
tokens.

**`204` response**: no body.

---

## 4. Widget Types

### `GET /widget-types`

**Authenticated.** Lists every widget type with its parameters. This route
feeds the configuration form generated dynamically on the frontend.

**`200` response**

```json
[
  {
    "id": "city_temperature",
    "service": "weather",
    "name": "city_temperature",
    "description": "Display the current temperature for a city",
    "requiresAuth": false,
    "params": [
      { "name": "city", "type": "string" }
    ]
  },
  {
    "id": "github_commits",
    "service": "github",
    "name": "github_commits",
    "description": "List the latest commits of a repository",
    "requiresAuth": true,
    "params": [
      { "name": "repo",  "type": "string"  },
      { "name": "count", "type": "integer" }
    ]
  }
]
```

The complete list of the 8 widgets and their parameters is in
`docs/Services/Services.md`.

---

## 5. Widget Instances

A widget instance belongs to one user. An instance owned by someone else
behaves as if it did not exist: `404`, never `403`, so that its existence is
not revealed.

### `GET /widgets`

**Authenticated.** Every instance on the current user's dashboard.

**`200` response**

```json
[
  {
    "id": "uuid",
    "widgetTypeId": "city_temperature",
    "params": { "city": "Paris" },
    "refreshRate": 300,
    "position": { "x": 0, "y": 0, "w": 2, "h": 2 }
  }
]
```

---

### `POST /widgets`

**Authenticated.** Creates a configured instance and schedules its refresh
job.

**Request**

```json
{
  "widgetTypeId": "city_temperature",
  "params": { "city": "Paris" },
  "refreshRate": 300,
  "position": { "x": 0, "y": 0, "w": 2, "h": 2 }
}
```

- `params`: every parameter declared by the widget type is required, with
  the declared type
- `refreshRate`: seconds, integer, minimum `30` (protects third-party rate
  limits)
- `position`: optional, defaults to `{ "x": 0, "y": 0, "w": 2, "h": 2 }`

**`201` response**: the created instance, same shape as `GET /widgets`.

**Errors**

| Code | Body |
|---|---|
| `400` | `{ "error": "Invalid input", "details": [...] }` for an unknown type, a missing or mistyped param, or a `refreshRate` below 30 |
| `403` | `{ "error": "Service not subscribed" }` |

---

### `PATCH /widgets/:id`

**Authenticated.** Reconfigures, moves, or resizes an instance. Every field is
optional: only the fields provided are validated and changed.

**Request**

```json
{
  "params": { "city": "Tokyo" },
  "refreshRate": 600,
  "position": { "x": 2, "y": 0, "w": 2, "h": 2 }
}
```

Changing `params` resets the cached data: the next `GET /widgets/:id/data`
answers `pending`.

**`200` response**: the updated instance.

**Errors**

| Code | Body |
|---|---|
| `400` | `{ "error": "Invalid input", "details": [...] }` |
| `404` | `{ "error": "Widget not found" }` |

---

### `DELETE /widgets/:id`

**Authenticated.** Deletes the instance and its refresh job.

**`204` response**: no body.

**Errors**

| Code | Body |
|---|---|
| `404` | `{ "error": "Widget not found" }` |

---

### `GET /widgets/:id/data`

**Authenticated.** Returns the **cached data** of the instance. This route
never calls an external API: the worker (Timer) feeds the cache in the
background.

**`200` response**

```json
{
  "data": { "city": "Paris", "temperature": 16.4, "condition": "Partly cloudy" },
  "fetchedAt": "2026-09-16T14:32:00.000Z",
  "status": "ok"
}
```

`status` is one of:

| Value | Meaning |
|---|---|
| `ok` | Data is up to date |
| `pending` | No refresh has run yet; `data` and `fetchedAt` are `null` |
| `error` | The last refresh failed; `error` holds the reason |

Error example:

```json
{
  "data": null,
  "fetchedAt": "2026-09-16T14:32:00.000Z",
  "status": "error",
  "error": "rate_limit"
}
```

A failing widget answers `200` with `status: "error"`, not a `4xx`/`5xx`: the
request itself succeeded, only the underlying data is unavailable. The
frontend must handle the three states, and a widget in error must never break
the display of the others.

**Errors**

| Code | Body |
|---|---|
| `404` | `{ "error": "Widget not found" }` |

---

## 6. Administration

### `GET /admin/users`

**Admin.** Lists every account. Never exposes passwords or tokens.

**`200` response**

```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "isVerified": true,
    "createdAt": "2026-09-01T10:00:00.000Z"
  }
]
```

**Errors**

| Code | Body |
|---|---|
| `403` | `{ "error": "Insufficient permissions" }` |

---

### `DELETE /admin/users/:id`

**Admin.** Deletes an account together with its widgets and subscriptions.

**`204` response**: no body.

**Errors**

| Code | Body |
|---|---|
| `403` | `{ "error": "Insufficient permissions" }` |
| `404` | `{ "error": "User not found" }` |

---

## Implementation Status

| Route | Server | Mock |
|---|---|---|
| `GET /about.json` | Done (services still hard-coded) | Done |
| `POST /auth/register` | Done | Done |
| `GET /auth/verify` | Done | Done |
| `POST /auth/login` | Done | Done |
| `GET /auth/me` | Done | Done |
| `POST /auth/logout` | Done | Done |
| `GET /services` | Phase 2 | Done |
| `GET /oauth/:service/authorize` | Phase 2 | Done (simulated) |
| `GET /oauth/:service/callback` | Phase 2 | Not applicable |
| `DELETE /services/:service/subscription` | Phase 2 | Done |
| `GET /widget-types` | Phase 2 | Done |
| `GET /widgets` | Phase 2 | Done |
| `POST /widgets` | Phase 2 | Done |
| `PATCH /widgets/:id` | Phase 2 | Done |
| `DELETE /widgets/:id` | Phase 2 | Done |
| `GET /widgets/:id/data` | Phase 3 | Done |
| `GET /admin/users` | Phase 3 | Done |
| `DELETE /admin/users/:id` | Phase 3 | Done |

---

## Change Log

### Phase 1, card 1.6 (mock)

Discrepancies found while building the mock, fixed so that the contract
matches the server:

| Change | Reason |
|---|---|
| `github_commits` parameter renamed from `number` to `count` | The server (`about.ts`) and `docs/Services/Services.md` already used `count` |
| `details` field added to the error format | The server returns it on validation errors |
| `POST /auth/logout` marked **public** instead of authenticated | The server clears the cookie without requiring a token |
| `400` added to `POST /auth/login` | Returned by the server when a field is missing |
| `404` added to `PATCH`, `DELETE`, and `GET .../data` on widgets | An unknown or foreign widget must be reported |
| Exact `403` message for an unsubscribed service | `Service not subscribed` |
| `rss` added to the `GET /services` example | Four services are planned, not three |
| Document fully translated to English | It mixed French and English |

---

## Rule for Changing This Document

Any change to a route already listed here must be **announced to the other
team member before being coded**. This is the only hard dependency between
backend and frontend work: as long as this contract is respected, each person
moves forward without waiting for the other.

A change to this document is made **in the same commit** as the matching
change in `server/` and in `client_web/src/lib/mock/`.
