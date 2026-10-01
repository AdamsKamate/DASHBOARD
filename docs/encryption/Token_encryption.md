# OAuth Token Encryption and Storage

Documentation for **Phase 2 card 2.3**: AES-GCM encryption with the application
key, stored in `user_services` and linked to the user.

Covers constraints **C6** (linking a third-party account to a platform user)
and **C13** (encrypted tokens, secrets never exposed to the client).

Validation criterion: **the token stored in the database is unreadable without the key.**

---

## 1. Where This Card Fits in the OAuth Flow

```
 1. the user clicks « Lier mon compte GitHub »
 2. redirect to GitHub with a state
 3. the user accepts on github.com
 4. GitHub redirects to our callback
 5. state verification
 6. exchange the code for a token
       ¦
 7.    ¦-> encryption and storage             <- THIS CARD
             in user_services, linked to the user
```

Before this card, the token was retrieved and then **lost**: the callback
logged it and discarded it. Account linking is now persistent.

---

## 2. Encrypt, Do Not Hash
| | Password | OAuth token |
|---|---|---|
| Operation | **Hashing** (bcrypt) | **Encryption** (AES-GCM) |
| Reversible | No, never | Yes, with the key |
| Why | We only compare it | We must **read it back** to call GitHub |

A password is never read back: at login, we hash the input and compare the two
digests. An OAuth token, however, must be sent as-is to the provider API.
Hashing is therefore **impossible** here.

---

## 3. Files

| File | Role |
|---|---|
| `server/src/lib/crypto.ts` | AES-256-GCM encryption and decryption |
| `server/src/db/repositories/userServices.ts` | Encrypted user/service link |
| `server/src/routes/oauth.ts` | The callback calls `linkService()` |

The `user_services` table has existed since Phase 0:

```sql
CREATE TABLE IF NOT EXISTS user_services (
  user_id        UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  service_id     TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  access_token   TEXT, -- encrypted
  refresh_token  TEXT, -- encrypted
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, service_id)
);
```

The composite primary key `(user_id, service_id)` is at the heart of constraint
C6: a user has **at most one** link per service, and deleting an account
cascades to its links.

---

## 4. Why AES-256-GCM

### GCM Encrypts and Authenticates

This is the difference from an older mode such as CBC.

| Situation | AES-CBC | **AES-GCM** |
|---|---|---|
| Normal decryption | Works | Works |
| Ciphertext modified in the database | Produces random bytes, **without reporting it** | **Refuses to decrypt** |

With CBC, an altered value, whether caused by disk corruption or malicious
modification, would produce a “token” made of arbitrary bytes that we would
quietly send to GitHub. The error would come back from GitHub without revealing
the real cause.

GCM also produces a 16-byte **authentication tag**. During decryption, if the
ciphertext or tag changes by even one bit, the operation fails.

### AES-256

The key is 32 bytes, or 256 bits. This is the standard symmetric encryption
algorithm used by operating systems and password managers.

---

## 5. The Application Key

```bash
ENCRYPTION_KEY=
```

Generate it once with:

```bash
openssl rand -base64 32
```

### It Is Validated on First Use

```ts
const key = Buffer.from(rawKey, "base64");
if (key.length !== 32) {
  throw new Error(
    `ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}. ` +
      `Generate a valid one with: openssl rand -base64 32`
  );
}
```

Without this check, a key that is too short would make `createCipheriv` fail
with an obscure message from the `crypto` module. Here, the message identifies
the problem and provides the command.

### It Is Loaded Lazily

```ts
let cachedKey: Buffer | null = null;
```

The key is not read when the module is imported, but on the first encryption. A
script that imports this file without ever encrypting, such as a migration
tool, should not fail because the variable is missing.

### It Never Appears in the Code

It exists only in `.env`, which is not committed. This makes the database
useless without it: an attacker who obtained a SQL export would have only
unreadable strings.

---

## 6. The Stored Format

```
iv:tag:ciphertext
```

Three base64 parts separated by colons:

| Part | Size | Role |
|---|---|---|
| `iv` | 12 bytes | Initialization vector |
| `tag` | 16 bytes | GCM authentication tag |
| `ciphertext` | variable | Encrypted token |

### The Initialization Vector Is Not Secret

It is stored in plaintext next to the ciphertext, as prescribed by the
standard. What must remain secret is **the key**.

### It Is Randomly Generated for Every Encryption

```ts
const initialisationVector = crypto.randomBytes(INITIALISATION_VECTOR_LENGTH);
```

This is the most important point in this file. **Reusing a vector with the same
key is the classic GCM mistake**: it allows an attacker to recover plaintext by
comparing two ciphertexts.

Encrypting the same token twice produces **two different values**. This is
intentional, not a bug. A test verifies that 500 encryptions produce 500 unique
vectors.

### Why 12 Bytes

This is the recommended size for GCM. A shorter vector weakens the guarantees;
a longer one requires an additional internal hashing step without providing a
benefit.

---

## 7. Encryption Belongs in the Repository

```ts
export async function linkService(
  userId: string,
  serviceId: string,
  tokens: TokensToStore
): Promise<void> {
  await query(
    `INSERT INTO user_services (...) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, service_id) DO UPDATE SET ...`,
    [
      userId,
      serviceId,
      encrypt(tokens.accessToken),
      encryptOptional(tokens.refreshToken),
      tokens.expiresAt,
    ]
  );
}
```

This is an architectural choice, not a detail.

**No route handles encrypted values**, and, more importantly, there is no way
to store a token without going through this function. If encryption were
implemented in the callback, another part of the code could forget it and no
one would notice before an audit.

The callback therefore only does this:

```ts
await linkService(authorizationRequest.userId, serviceName, {
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  expiresAt: tokens.expiresAt,
});
```

### `ON CONFLICT` Instead of Delete and Insert

Relinking an already linked account is a normal action: the user may want to
refresh authorization or request broader permissions. The update replaces the
tokens **while preserving `created_at`**, the initial link date.

Deleting and reinserting would lose this information and create a window in
which the link does not exist.

### `expires_at` Remains in Plaintext

It is not a secret. Keeping it readable makes it possible to find tokens that
are about to expire with SQL:

```sql
SELECT user_id, service_id FROM user_services
 WHERE expires_at < now() + interval '5 minutes';
```

Encrypting this column would require decrypting every row to answer this
query.

---

## 8. The Refresh Token May Be Absent

```ts
export function encryptOptional(plainText: string | null): string | null {
  return plainText === null ? null : encrypt(plainText);
}
```

GitHub does not send a refresh token: its tokens do not expire. Google does
send one.

The column therefore remains **`NULL`**, rather than containing the encryption
of an empty string. The distinction matters: `NULL` means “this provider does
not provide one”; an encrypted empty string would mean “it provided one, but it
was empty,” which makes no sense.

---

## 9. Reading Tokens

```ts
export async function findSubscription(
  userId: string,
  serviceId: string
): Promise<ServiceSubscription | null>
```

This decrypts the tokens and returns an object that can be used directly. This
is what widgets will call in Phase 2 to query GitHub or Google.

### The Service List Contains No Tokens

```ts
export async function listLinkedServices(userId: string): Promise<string[]> {
  const rows = await query<{ service_id: string }>(
    `SELECT service_id FROM user_services WHERE user_id = $1 ORDER BY service_id`,
    [userId]
  );
  return rows.map((row) => row.service_id);
}
```

This function feeds `GET /services`, whose response is sent **to the browser**.
It selects only `service_id`: even by accident, no token can leak through this
route.

This is constraint C13 at the output boundary: secrets never reach the client.

### Isolation Between Users

Every query filters by `user_id`. A user cannot read another user's
subscription, even if they know its service identifier; a test verifies this.

---

## 10. Expiration

```ts
export function isTokenExpired(subscription: ServiceSubscription): boolean {
  if (!subscription.expiresAt) {
    return false;
  }
  const oneMinuteFromNow = Date.now() + 60_000;
  return subscription.expiresAt.getTime() <= oneMinuteFromNow;
}
```

The **one-minute margin** avoids an unpleasant case: a token passes the check
and expires during the API call that follows. It is better to consider it
expired one minute early than to receive a `401` from the provider.

A token without an expiration, as with GitHub, is never considered expired. It
remains valid until revoked by the user.

Automatic refresh with the refresh token will arrive later in Phase 2; this
function is the building block that will trigger it.

---

## 11. Unlinking

```ts
export async function unlinkService(userId: string, serviceId: string): Promise<boolean>
```

The entire row is **deleted**, rather than clearing its columns. A token that
is no longer used has no reason to remain in the database, even encrypted:
fewer sensitive data items means less exposure in case of a breach.

The returned boolean allows the route to distinguish “unlinked” from “was not
linked.”

---

## 12. Tests

### Installation

```bash
cd ~/TECH3/G-WEB-500-PAR-5-1-dashboard-30
tar xzf ~/Téléchargements/encrypt-tokens.tar.gz

grep ENCRYPTION_KEY .env
```

If the value is empty:

```bash
sed -i "s|^ENCRYPTION_KEY=$|ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
```

```bash
docker-compose up -d --force-recreate server
docker-compose exec server npx tsc --noEmit -p tsconfig.json
docker-compose logs --tail=10 server
```

Expected: `Server listening on port 8080`.

### The Card's Validation Criterion

No OAuth provider has been registered yet, so the table is empty. We can still
verify encryption directly:

```bash
docker-compose exec server npx ts-node -e "
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  const { encrypt, decrypt } = require('./src/lib/crypto');
  const token = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';
  const stored = encrypt(token);
  console.log('en base   :', stored);
  console.log('relu      :', decrypt(stored));
  console.log('lisible ? :', stored.includes(token));
"
```

Expected: an `iv:tag:ciphertext` string, the original token after decryption,
and `lisible ? : false`.

### Once GitHub Is Connected (Next Card)

```bash
docker-compose exec db psql -U dashboard -d dashboard \
  -c 'SELECT user_id, service_id, left(access_token, 45) AS token, expires_at FROM user_services'
```

Expected: a `token` column containing a value such as
`szj3mDce0XMJdGM3:ly/*******==:...`, and a readable `expires_at` column.

This is **the key demonstration**: the token is unreadable in the database.

### Verify That the Key Is Required

Temporarily change `ENCRYPTION_KEY` in `.env`, recreate the server, and read a
subscription: decryption fails. Then restore the old key.

This is the clearest demonstration of the criterion.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Compilation | No errors |
| 2 | Encrypt a token | `iv:tag:ciphertext` format |
| 3 | Token in the stored value | Absent |
| 4 | Encrypt twice | Two different values |
| 5 | Decryption | The original token |
| 6 | Altered value | Rejected |
| 7 | Different key | Rejected |
| 8 | Database column | Unreadable |

---

## 13. Questions

**Why not hash tokens like passwords?**
Because they must be read back to call the provider API. Hashing is one-way.

**Why GCM instead of CBC?**
GCM authenticates in addition to encrypting. Modified ciphertext is rejected,
whereas CBC would produce random bytes without reporting anything.

**Why does the same token produce two different ciphertexts?**
Because a random initialization vector is generated each time. Reusing a vector
with the same key would allow plaintext recovery.

**Isn't the initialization vector a secret?**
No. It is stored in plaintext next to the ciphertext, as prescribed by the
standard. Only the key is secret.

**Where is the key?**
In `.env`, never in the code or repository. The database is unusable without
it.

**What if someone steals the database?**
They get unreadable strings. They would also need the key, which is not in the
database.

---

## 15. What Remains to Be Done

| Item | Card |
|---|---|
| GitHub provider (`services/github.ts`) | 2.4 |
| Google provider | 2.5 |
| `GET /services` route listing subscriptions | Phase 2 |
| `DELETE /services/:service/subscription` | Phase 2 |
| Refreshing an expired token | Phase 2 |
| Widgets calling APIs with the decrypted token | Phase 2 |

`isTokenExpired()` is implemented and tested but is not called anywhere yet:
it is waiting for automatic refresh.
