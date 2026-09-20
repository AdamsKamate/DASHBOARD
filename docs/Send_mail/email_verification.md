# Email Delivery and Account Confirmation

Documentation for **Phase 1 tile 1.3**. This document explains how the
confirmation email is sent, how an account is verified, and which technical
decisions were made.

Covers constraint **C3** (an unconfirmed account cannot access the platform).

---

## 1. Overview

```
POST /auth/register
  │
  ├> account created, is_verified = FALSE             repositories/users.ts
  │
  ├> confirmation email sent                          lib/mailer.ts
  │      failure -> logged, registration NOT cancelled
  │
  └> 201 Account created, email confirmation required

                    the user opens the link in the email
                                v
GET /auth/verify?token=<64 hex characters>
  │
  ├> token lookup, is_verified = TRUE, token cleared  repositories/users.ts
  │      no match -> 400 Invalid or expired token
  │
  └> 200 Account confirmed
```

The token travels only through the email. It never appears in an HTTP
response, which is what makes the verification meaningful.

---

## 2. Relevant Files

| File | Purpose |
|---|---|
| `server/src/lib/mailer.ts` | SMTP transport and confirmation email template |
| `server/src/routes/auth.ts` | Email sending and the `GET /auth/verify` route |
| `server/src/db/repositories/users.ts` | `verifyUserByToken()`, implemented in card 1.1 |
| `docker-compose.yml` | The `mailhog` service |
| `.env.example` | SMTP configuration |

The routes never know which transport is used. Moving from MailHog in
development to a real provider in production requires changing environment
variables only, with no code change.

---

## 3. Why MailHog

The assignment suggested Mailtrap or Ethereal. Both were rejected in favour of
MailHog for one decisive reason: **reproducibility**.

| Option | External account | Credentials in `.env` | Works offline |
|---|---|---|---|
| Mailtrap | Required | Required | No |
| Ethereal | Generated at runtime | Generated at runtime | No |
| **MailHog** | **None** | **None** | **Yes** |

MailHog runs as a container inside `docker-compose`. A grader running
`docker-compose up` can register an account and read the confirmation email at
`http://localhost:8025` without creating anything or configuring anything.

With Mailtrap, the project would only be testable by someone holding our
credentials, and those credentials would either be committed (a security
issue) or missing (a broken project). Neither outcome is acceptable for a
deliverable that must run on a clean machine.

### How MailHog works

MailHog is a fake SMTP server. It accepts every message, **delivers none of
them**, and displays them in a web interface. No email ever leaves the
machine, which also means no risk of accidentally emailing a real person
during development.

| Port | Use |
|---|---|
| `1025` | SMTP, used by the server container |
| `8025` | Web interface, opened in a browser |

Only port 8025 is published to the host. Port 1025 stays inside the Docker
network, because only the `server` container needs it.

---

## 4. The Mailer Module

### A transport created once

```ts
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({ ... });
  return transporter;
}
```

Creating a transport opens an SMTP connection. Doing it per message would add
latency to every registration. Nodemailer keeps a connection pool when the
transport is reused.

### The `secure` flag

```ts
secure: port === 465,
```

This is not a preference but a protocol rule:

| Port | Behaviour |
|---|---|
| `465` | Implicit TLS: the connection is encrypted from the first byte |
| `587` | Plaintext start, then upgraded through STARTTLS |
| `1025` | MailHog, no encryption |

Setting `secure: true` on port 1025 would make the connection hang, because
MailHog would be waiting for a plaintext greeting while nodemailer starts a
TLS handshake.

### Optional authentication

```ts
auth: process.env.SMTP_USER
  ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  : undefined,
```

MailHog requires no authentication. Passing an `auth` object with empty
strings would make nodemailer attempt a login and fail. The object is
therefore omitted entirely rather than left empty.

This also makes the module work unchanged with a real provider: filling
`SMTP_USER` in `.env` is enough to enable authentication.

### Graceful degradation

```ts
export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}
```

When `SMTP_HOST` is missing, the application stays usable: the confirmation
link is written to the logs instead of being emailed. A teammate who has not
configured their `.env` yet can still test the full flow.

This fallback logs a warning, so it is visible rather than silent:

```
[auth] SMTP not configured, verification link for user@example.com: http://...
```

---

## 5. Delivery Failure Does Not Cancel Registration

```ts
const sent = await sendVerificationEmail(user.email, verificationToken);

if (!sent) {
  console.error(`[auth] could not send verification email to ${user.email}`);
}

return res.status(201).json({ ... });
```

The account already exists in the database by the time the email is attempted.
Returning an error at this point would leave the user without an account
because an SMTP server was briefly unreachable, and a retry would then fail
with `409 Email already in use`.

`sendMail()` therefore returns `false` instead of throwing, and the caller
decides what to do. The registration succeeds; only the email failed.

A production system would add a "resend confirmation email" route to recover
from this case. It is out of scope for this card.

---

## 6. The Email Itself

### Plain text and HTML

```ts
text: "...",
html: "...",
```

Both versions are always provided:

- some clients block HTML rendering, and would otherwise show an empty message
- a message with no plain-text part is more likely to be classified as spam

Nodemailer builds a `multipart/alternative` message and the client picks the
version it can display.

### The link is repeated in the HTML

```html
<a href="${link}">Confirm my account</a>
...
If the button does not work, copy this link into your browser:
<a href="${link}">${link}</a>
```

Some clients strip styled buttons. Showing the raw URL as a fallback means the
user is never stuck.

---

## 7. The Confirmation Route

### Single-use links

The route relies on the repository query written in card 1.1:

```sql
UPDATE users
   SET is_verified = TRUE, verification_token = NULL
 WHERE verification_token = $1
 RETURNING *
```

The token is cleared in the same statement that confirms the account. A second
visit therefore matches no row and returns `400`.

Clearing the token also means a leaked email (forwarded, or read from an
archived mailbox) cannot be used to re-confirm an account later.

### Identical error messages

```ts
if (!user) {
  return res.status(400).json({ error: "Invalid or expired token" });
}
```

An unknown token, an already-used token, and a missing token all produce the
same response.

Distinguishing them would leak information: an attacker probing tokens could
learn which ones once existed, which narrows a brute-force search. The
constant response reveals nothing.

### Input type checking

```ts
if (typeof token !== "string" || token.length === 0) {
  return res.status(400).json({ error: "Invalid or expired token" });
}
```

Express parses `?token=a&token=b` into an **array**, not a string. Without this
check, an array would be passed to the SQL query and produce a type error
rather than a clean `400`. The assignment requires validating all inputs; query
parameters are inputs too.

---

## 8. Configuration

```bash
# MailHog runs as a docker-compose service: no account, no credentials.
# Web UI to read sent emails: http://localhost:8025
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@dashboard.local
```

`SMTP_HOST=mailhog` is the **service name** in `docker-compose.yml`, not a
domain name. Docker resolves it inside its internal network, exactly like
`db` and `redis` in `DATABASE_URL` and `REDIS_URL`.

`SERVER_URL` is also used here: it builds the confirmation link. Setting it to
the wrong value produces links pointing at the wrong host.

### Switching to a real provider

Only `.env` changes:

```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<the API key>
SMTP_FROM=no-reply@yourdomain.com
```

No code is modified. This is the benefit of isolating the transport in
`lib/mailer.ts`.

---

## 9. Tests

### Full flow

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Open `http://localhost:8025` and read the message. Click the confirmation
button, or copy the link.

Expected: `{ "message": "Account confirmed" }`

### Card validation criterion

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, is_verified, verification_token FROM users'
```

Before confirmation: `is_verified = f`, a 64-character token.
After confirmation: `is_verified = t`, `verification_token = NULL`.

### Single use

Open the same link a second time.

Expected: `400 Invalid or expired token`

### Unknown token

```bash
curl "http://localhost:8080/auth/verify?token=unknown"
curl "http://localhost:8080/auth/verify"
```

Expected: `400` with the same message in both cases.

### Delivery failure

Stop MailHog and register an account:

```bash
docker-compose stop mailhog
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"offline@example.com","password":"password123"}'
```

Expected: `201` anyway, with an error line in the server logs. The account
exists in the database.

---

## 10. What This Card Does Not Cover

The mechanism enforcing C3 is now in place, but the **enforcement point is the
login route**, which belongs to card 1.4:

```ts
if (!user.is_verified) {
  return res.status(403).json({ error: "Account not confirmed" });
}
```

Until that check exists, an unconfirmed account is simply an account that
cannot log in because logging in is not implemented yet.

| Item | Card |
|---|---|
| Blocking unconfirmed accounts at login | 1.4 |
| Resend confirmation email | Out of scope |
| Token expiry after N hours | Out of scope |

### On token expiry

The current token never expires. Adding an `expires_at` column and rejecting
old tokens would be more rigorous, and is standard practice in production
systems.

It was deliberately left out: the assignment asks for a confirmation
mechanism, not a complete account lifecycle, and it warns against
over-engineering. The single-use property already prevents the main risk,
which is link replay.