# Registration: Password Hashing and Confirmation Token

Documentation for **Phase 1 card 1.2**. This document explains how an account
is created, why passwords are never stored in plaintext, and which technical
decisions were made.

Covers constraints **C3** (confirmation before access) and **C13** (sensitive
data).

---

## 1. Overview

```
POST /auth/register
  │
  ├> email and password validation                    lib/validation.ts
  │      failure -> 400 Invalid input
  │
  ├> email normalization (lowercase)                  lib/validation.ts
  │
  ├> bcrypt password hashing                          lib/password.ts
  │
  ├> random token generation (32 bytes)               routes/auth.ts
  │
  ├> database insertion, is_verified = FALSE          repositories/users.ts
  │      email already used -> 409 Email already in use
  │
  └> 201 Account created, email confirmation required
```

The plaintext password never leaves the route: only its hash is passed to the
repository and then stored.

---

## 2. Relevant Files

| File | Purpose |
|---|---|
| `server/src/lib/password.ts` | Bcrypt hashing and verification |
| `server/src/lib/validation.ts` | Input validation and email normalization |
| `server/src/routes/auth.ts` | The `POST /auth/register` route |
| `server/src/db/repositories/users.ts` | `createUser()`, implemented in card 1.1 |
| `server/src/index.ts` | Mounts the authentication router |

Each responsibility is isolated: the route orchestrates, the `lib/` modules
handle technical work, and the repository communicates with the database.
Changing the hashing algorithm would affect only one file.

---

## 3. Password Hashing

### Why Hash Instead of Encrypt

Encryption is reversible: with the key, the original password can be recovered.
A database leak combined with a key leak would expose every account.

Hashing is one-way. We do not store the password, but a fingerprint. At login,
we hash what the user enters and compare the two fingerprints. **No one,
including us, can recover a password from the database.**

### Why Bcrypt Instead of SHA-256

SHA-256 is designed to be **fast**, which is exactly what we do not want here.
A graphics card can calculate billions of SHA-256 hashes per second, so a
dictionary of common passwords could be tested in minutes.

Bcrypt is deliberately **slow**, and its cost can be configured. With a cost
of 10, each hash takes about 60 ms. Testing one million passwords would then
take days instead of seconds.

### Why Bcrypt Instead of Argon2

Argon2 is technically superior: it also consumes significant memory, which
neutralizes GPU attacks (a GPU has many cores but little memory per core).

The choice of bcrypt is based on a practical constraint: Argon2 requires native
compilation, which frequently fails on Alpine Linux, the base image of the
`server` container. Bcrypt has been proven for more than twenty years, is more
than sufficient for this project, and installs without friction.

This is an intentional trade-off between theoretical security and deployment
reliability, exactly the type of choice the assignment asks us to justify.

### Cost 10

```ts
const SALT_ROUNDS = 10;
```

The number of rounds is 2^10, or 1024 iterations. On an ordinary machine,
this represents approximately 60 ms per hash.

| Cost | Approximate time |
|---|---|
| 8 | ~15 ms: too fast, weakened protection |
| **10** | **~60 ms: selected compromise** |
| 12 | ~250 ms: safer, but noticeably slows registration |

This parameter is stored **in the hash itself**, allowing it to be increased
later without invalidating existing accounts.

### Automatic Salt

Bcrypt generates a random salt for every hash and includes it in the result.
The direct consequence is that **two users with the same password receive two
different hashes.**

```
password123 -> $2b$10$N9qo8uLOickgx2ZMRZoMye...
password123 -> $2b$10$k7Lz9vQnXpR4mBc2FdHjOu...   (the same, hashed again)
```

Without a salt, two accounts sharing the same hash would reveal that they have
the same password, and a precomputed table (a "rainbow table") could crack all
accounts at once.

There is therefore **nothing else to store**: the hash contains the algorithm,
the cost, and the salt.

```
$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
│  │  │ └────────────────── salt + hash ─────────────────────┘
│  │  └── cost (10)
│  └── bcrypt version
└── algorithm identifier
```

---

## 4. Confirmation Token

### Generation

```ts
crypto.randomBytes(32).toString("hex")
```

`crypto.randomBytes` uses the operating system's cryptographic random number
generator. **`Math.random()` would be a vulnerability**: it is predictable,
and an attacker who could guess a token could confirm someone else's account.

32 bytes produce 64 hexadecimal characters, or 2^256 possibilities, making
enumeration infeasible.

### Single Use

The token is stored in `users.verification_token`. During confirmation (the
next card), the query clears it as part of the operation:

```sql
UPDATE users
   SET is_verified = TRUE, verification_token = NULL
 WHERE verification_token = $1
```

The confirmation link can therefore be used **only once**.

### Never Returned to the Client

The `201` response contains neither the token nor the account identifier:

```json
{ "message": "Account created, email confirmation required" }
```

The token is meaningful only in the email. Returning it in the HTTP response
would allow an account to be confirmed without access to the mailbox, defeating
the verification required by C3.

---

## 5. Input Validation

The assignment explicitly requires validating all inputs. The rules are
centralized in `lib/validation.ts` instead of being scattered across routes.

### Email

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

Validation is **intentionally permissive**. Validating an email with a regular
expression is a classic trap: the actual grammar (RFC 5322) allows unusual
forms, and every strict regex eventually rejects legitimate addresses.

We use a minimal format check. Proof that an address really exists comes from
**the confirmation email**, which is precisely its purpose.

### Password

| Rule | Value | Reason |
|---|---|---|
| Minimum length | 8 characters | OWASP / ANSSI recommendation |
| Maximum length | **72 bytes** | Bcrypt technical constraint |

The upper limit is not a design preference. **Bcrypt silently ignores anything
over 72 bytes.** Without this check, two different passwords sharing their
first 72 bytes would be considered identical at login, a subtle vulnerability
that few projects anticipate.

No complexity rule is imposed (uppercase letters, numbers, symbols). OWASP has
recommended for several years that **length** be prioritized: a long passphrase
resists attacks better than a short word filled with special characters and is
less likely to make users write down their password.

### Email Normalization

```ts
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

`User@Example.COM` and `user@example.com` identify the same mailbox, but
PostgreSQL's `UNIQUE` constraint is **case-sensitive**. Without normalization,
two separate accounts could be created for the same person.

Normalization is applied before insertion, so the database contains only
lowercase addresses and duplicates are correctly detected.

---

## 6. Error Handling

| Code | Case | Response |
|---|---|---|
| `201` | Account created | `{ "message": "Account created, email confirmation required" }` |
| `400` | Invalid input | `{ "error": "Invalid input", "details": [...] }` |
| `409` | Email already used | `{ "error": "Email already in use" }` |
| `500` | Unexpected error | `{ "error": "Internal server error" }` |

### Status 409 and Duplicate Races

We could check whether the email exists before inserting. This is a bad idea:
between the `SELECT` and the `INSERT`, another request could create the same
account (a race condition).

We therefore let PostgreSQL decide and intercept its error code:

```ts
const PG_UNIQUE_VIOLATION = "23505";

if (pgError.code === PG_UNIQUE_VIOLATION) {
  return res.status(409).json({ error: "Email already in use" });
}
```

The database `UNIQUE` constraint is the only reliable guarantee because it is
atomic.

### Internal Errors Do Not Leak

```ts
console.error("[auth] registration failed:", (err as Error).message);
return res.status(500).json({ error: "Internal server error" });
```

The details go to the logs, not the response. Returning a PostgreSQL message to
the client would reveal table and column names; the assignment requires
avoiding exposure of implementation details.

---

## 7. Temporary: Link in the Logs

Until email delivery is implemented (the next card), the confirmation link is
displayed in the server logs:

```
[auth] verification link for test@example.com:
http://localhost:8080/auth/verify?token=29247310e37d86d0...
```

This allows the complete flow to be tested immediately.

**This must be removed** once real email delivery is in place: logging a
security token is a vulnerability because logs are often readable by more
people than the database.

---

## 8. Tests

### Successful Registration

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Expected: `201` and the confirmation message.

### Card Validation Criterion

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash, is_verified FROM users'
```

Three things to check:

- `password_hash` starts with `$2b$10$`: never the plaintext password
- `is_verified` is `f`: the account is not yet confirmed (C3)
- `email` is lowercase

### Case-Insensitive Duplicate

```bash
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"TEST@EXAMPLE.COM","password":"password123"}'
```

Expected: `409`.

### Validation

```bash
# invalid email
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"password123"}'

# password too short
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.co","password":"short"}'

# empty body
curl -X POST http://localhost:8080/auth/register \
  -H "Content-Type: application/json" -d '{}'
```

Expected: `400` with the error details.

### Verify the Random Salt

Register two accounts with the **same** password, then:

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT email, password_hash FROM users'
```

The two hashes must be **different**.

---

## 9. Remaining Work

| Item | Card |
|---|---|
| Actual confirmation email delivery | 1.3 |
| `GET /auth/verify` route | 1.3 |
| Remove the token `console.log` | 1.3 |
| Login and block unconfirmed accounts | 1.4 |

`verifyPassword()` already exists in `lib/password.ts`; it is not used yet.
