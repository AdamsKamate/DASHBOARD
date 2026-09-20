# Database : Migrations and Data Access Layer

Documentation for **Phase 1 : Migrations PostgreSQL + accès base de données*. This document explains how the schema
is applied, how the code communicates with PostgreSQL, and which team rules
must be followed to keep databases synchronized.

---

## 1. Why Use a Migration System

### The Phase 0 Problem

In Phase 0, Docker applied the schema through a mount:

```yaml
volumes:
  - ./server/src/db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
```

PostgreSQL executes the contents of `/docker-entrypoint-initdb.d/` **only once:
when the volume is first created**. As a direct consequence, every schema
change required:

```bash
docker-compose down -v   # -v removes the volume
```

which deletes **all data**, test accounts, configured widgets, and OAuth
tokens. This was acceptable at the very beginning of the project, but became
unmanageable once working data existed.

### The Chosen Solution

A *migration runner*: each SQL file is run once, its name is recorded in a
tracking table, and new files are applied automatically at the next startup.
**Data is preserved.**

This is the standard mechanism used by serious frameworks (Rails, Django,
Laravel, Prisma). Here it is written manually in about one hundred lines,
avoiding a heavy dependency for a simple need, in line with the assignment's
instruction: *"Focus on clear, minimal solutions"*.

---

## 2. Directory Structure

```
server/src/db/
├── index.ts                      connection pool and query helpers
├── migrate.ts                    migration runner
├── migrations/
│   └── 001_initial_schema.sql    the project's 6 tables
└── repositories/
  ├── users.ts                  access to the users table
  └── services.ts               registry-to-database synchronization
```

---

## 3. The Migration Runner (`migrate.ts`)

### How It Works

At every server startup, in this order:

1. **Wait for PostgreSQL**,  `waitForDatabase()` retries up to 10 times.
  The `docker-compose` healthcheck already covers this case, but when running
  locally outside Docker, the database may start more slowly than the server.

2. **Create the tracking table if it does not exist**:

   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     name        TEXT PRIMARY KEY,
     applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

3. **List already-applied migrations** : a `SELECT name FROM
  schema_migrations`.

4. **List the files in the** `migrations/` **directory**, sorted
  alphabetically.

5. **Calculate the difference**: files present on disk but absent from the
  table.

6. **Apply each missing migration**, using one transaction per file:

   ```
   BEGIN
     <contenu du fichier .sql>
     INSERT INTO schema_migrations (name) VALUES ('001_initial_schema.sql')
   COMMIT
   ```

### What the Transaction Guarantees

If an SQL statement fails in the middle of a file, `ROLLBACK` cancels **the
entire file**, including the record in `schema_migrations`. The database is
never left in a partially migrated state: fix the file and run it again, and
the migration will be replayed from the beginning.

`client.release()` in the `finally` block is just as important: without it, a
failed migration would keep a connection open indefinitely. After a few
failures, the pool would be exhausted and the application would be blocked.

### Expected Output

First startup with an empty database:

```
[migrate] applying 1 migration(s)
[migrate] 001_initial_schema.sql applied
[migrate] completed
```

Subsequent startups:

```
[migrate] database is up to date (1 migration(s) applied)
```

---

## 4. Migration Naming Convention

Format: `NNN_short_description.sql`

| Element | Purpose |
|---|---|
| `NNN` | **Three-digit** number that guarantees execution order |
| `short_description` | What the migration does, in snake_case |
| `.sql` | Only `.sql` files are read |

### Why Three Digits

The runner sorts files **alphabetically**, not numerically. With a single digit,
the sort order would be:

```
1_init.sql, 10_add_index.sql, 2_add_column.sql
```

The tenth migration would come before the second, and a column could be added
to a table that had not been created yet. With `001_`, `002_`, ... `010_`, the
alphabetical order matches the chronological order through 999 migrations.

### Examples for the Rest of the Project

```
001_initial_schema.sql
002_add_user_avatar.sql
003_widget_cache_status_index.sql
```

---

## 5. Team Rules : Must Be Followed

### Never Edit an Applied Migration

Once `001_initial_schema.sql` is recorded in `schema_migrations`, the runner
will **never** run it again. If we modify its contents:

- the database does not change (the migration is marked as applied)
- the mate database does not change either
- but an empty database (such as the evaluator's) will apply the modified version

The result is three different schemas and a bug that appears for only one
person. This is the classic migration trap.

**To change the schema, always create a new migration:**

```sql
-- server/src/db/migrations/002_add_user_avatar.sql
ALTER TABLE users ADD COLUMN avatar_url TEXT;
```

### One Migration per Logical Change

Use one migration to add a column and another to create an index. If one fails,
it is immediately clear which one caused the problem.

### Announce Migrations

When we push a migration, notify your teammate: they must restart their
server for it to be applied. Otherwise, their code may reference a column that
does not exist in their database.

---

## 6. The Data Access Layer (`index.ts`)

### The Connection Pool

```ts
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
```

Opening a TCP connection to PostgreSQL takes several milliseconds. Doing so
for every HTTP request would be slow and could overload the database (100
simultaneous connections by default). The pool keeps up to 10 connections
open and reuses them.

The server and worker run in separate containers, so each has its own pool of
10 connections.

| Option | Effect |
|---|---|
| `max: 10` | Maximum number of simultaneous connections |
| `idleTimeoutMillis` | Closes a connection unused for 30 seconds |
| `connectionTimeoutMillis` | Fails after 5 seconds if the database is unreachable instead of waiting indefinitely |

### `query()` : The Basic Function

```ts
const users = await query<User>("SELECT * FROM users WHERE email = $1", [email]);
```

**Values always use `$1`, `$2`, and so on; never use string concatenation.**
This prevents SQL injection: PostgreSQL treats the parameter as data, never as
executable code.

Never write:

```ts
// VULNERABILITY: an email containing "'; DROP TABLE users; --" destroys the database
query(`SELECT * FROM users WHERE email = '${email}'`);
```

The assignment emphasizes this point: *"validate all inputs"*, *"ensure
security by design"*.

### `queryOne()` : A Single Row

Returns the first row or `null`. This avoids repeating `rows[0]` everywhere:

```ts
const user = await queryOne<User>("SELECT * FROM users WHERE id = $1", [id]);
if (!user) return res.status(404).json({ error: "User not found" });
```

### `transaction()` : Multiple Atomic Queries

```ts
await transaction(async (client) => {
  await client.query("INSERT INTO widget_instances ...");
  await client.query("INSERT INTO widget_cache ...");
});
```

If the second query fails, the first one is rolled back. Without a transaction,
we would end up with a widget instance without a cache row, an inconsistent
state that would fail when read.

Use it whenever an operation affects multiple tables.

### `ping()` and `waitForDatabase()`

`ping()` executes `SELECT 1` and returns a boolean. It is used by the
`/health` route and at startup.

`waitForDatabase()` retries in a loop until the database responds.

### `closePool()`

It is called on `SIGINT` and `SIGTERM` to release connections cleanly.
Without it, PostgreSQL keeps stale connections until its own timeout expires.

---

## 7. Repositories

### Principle

All SQL queries targeting a table live in **one file**. Express routes call
these functions without writing SQL themselves.

Benefit: if a table's structure changes, only one file needs to be updated,
instead of a query spread across five different routes.

### `repositories/users.ts`

| Function | Usage |
|---|---|
| `createUser()` | Registration, the password must **already be hashed** by the caller |
| `findUserByEmail()` | Login |
| `findUserById()` | Authentication middleware, `/auth/me` route |
| `verifyUserByToken()` | Email account confirmation |
| `listUsers()` | Administration section |
| `deleteUser()` | Administration section |

The repository handles **data access**, not cryptography. The registration
route calls bcrypt and then passes the hash here. This separation keeps the
repository testable and reusable.

Two distinct types:

- `User` : the complete row, with `password_hash` and `verification_token`
- `PublicUser` : what is returned to the client, **without** the hash or token

The `toPublicUser()` function performs the conversion. It prevents a password
hash from being accidentally returned in an HTTP response.

`verifyUserByToken()` efface le token au passage :

```sql
UPDATE users
   SET is_verified = TRUE, verification_token = NULL
 WHERE verification_token = $1
```

The confirmation link can therefore only be used once.

### `repositories/services.ts`

This file connects the **`ServiceProvider` registry** (the code) to the
`services` and `widget_types` tables (the database).

```
registry.ts  -> syncRegistryToDatabase() ->  services + widget_types
  (the code)                                     (the database)
```

**The code is the source of truth.** Adding a service to `registry.ts` is
enough to make it appear in the database at the next startup; no manual
`INSERT` is needed.

This is essential because the `widget_instances` table references
`widget_type_id` through a foreign key. Without this synchronization,
`widget_types` would be empty and **no widget instance could be created**.

The function is **idempotent** because of `ON CONFLICT ... DO UPDATE`: running
it again does not create duplicates; it updates descriptions and parameter
schemas that may have changed.

---

## 8. Startup Sequence (`index.ts`)

```
1. runMigrations()            updates the schema
2. syncRegistryToDatabase()   reflects the registry in the tables
3. app.listen(8080)           starts accepting requests
```

The order is important: the server accepts no requests until the database is
ready. If a step fails, the process exits with an error code instead of serving
requests that would fail one by one.

### The `/health` Route

```bash
curl http://localhost:8080/health
# {"status":"ok","database":true}
```

Returns `200` if the database responds and `503` otherwise. This is useful for
diagnostics without opening `psql`, and can be reused as the Docker healthcheck
for the `server` service.

### Graceful Shutdown

```ts
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closePool();
    process.exit(0);
  });
}
```

`SIGTERM` is sent by `docker-compose stop` and `docker-compose restart`, while
`SIGINT` is sent by `Ctrl+C`. In both cases, connections are released before
the process exits.

---

## 9. Useful Commands

### Run Migrations Only

```bash
docker-compose exec server npm run migrate
```

Useful for applying a new migration without restarting the server.

### Inspect the Database

```bash
# List tables
docker-compose exec db psql -U dashboard -d dashboard -c '\dt'

# View applied migrations
docker-compose exec db psql -U dashboard -d dashboard -c 'SELECT * FROM schema_migrations'

# Check registry synchronization
docker-compose exec db psql -U dashboard -d dashboard -c 'SELECT * FROM services'
docker-compose exec db psql -U dashboard -d dashboard -c 'SELECT id, service_id FROM widget_types'

# Interactive session
docker-compose exec db psql -U dashboard -d dashboard
```

### Check That the Database Responds

```bash
curl http://localhost:8080/health
```

### Start with an Empty Database

```bash
docker-compose down -v && docker-compose up --build
```

Use this only intentionally: **this command deletes all data**. Since
migrations were introduced, it is no longer necessary for changing the schema.

---

## 10. Technical Detail: Production Build

`tsc` compiles `.ts` files into `dist/` but **does not copy `.sql` files**.
Without a fix, `dist/db/migrations/` would be empty and `npm start` would fail
with "Migration directory not found".

This is why the build script is:

```json
"build": "tsc -p tsconfig.json && cp -r src/db/migrations dist/db/migrations"
```

In development, `ts-node-dev` runs directly from `src/`, so the problem does
not occur, making it even easier to overlook.

---

## 11. Card Validation Criteria

| Test | Expected result |
|---|---|
| `docker-compose down -v && docker-compose up --build` | `[migrate] applying 1 migration(s)` then `applied` |
| `docker-compose restart server` | `[migrate] database is up to date` |
| `\dt` in psql | The 6 tables plus `schema_migrations` |
| `SELECT * FROM services` | Synchronized services from the registry |
| `curl /health` | `{"status":"ok","database":true}` |

The second test is the core of the card: **the migration must not run again,
and data must survive a restart.**
