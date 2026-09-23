# Redis : Client, Cache, and Resilience

Documentation for **Phase 1 title 1.5**. This document explains how the server
connects to Redis, why each choice was made, and how to verify that everything
works.

Card validation criterion: **the Redis container responds from the
application code**, proven by a SET/GET round trip at startup.

---

## 1. Role of Redis in the Project

Redis is an in-memory key-value database, extremely fast. It plays two
distinct roles in the project:

| Role | Phase | Why Redis |
|---|---|---|
| **Cache** for external API responses | 2-3 | Sub-millisecond reads, native key expiry |
| **Job queue** for the Timer (BullMQ) | 3 | BullMQ is built on Redis |

### Why a Cache Is Essential Here

Widgets display data from third-party APIs: weather, GitHub, Google. These
APIs enforce **request quotas**. Without a cache, ten users displaying the same
widget would trigger ten identical calls, and the quota would be exhausted
within minutes.

With the cache, the principle becomes:

```
Timer (worker)  -API call->  Redis  <-read-  GET /widgets/:id/data
                 every N s           instant
```

The frontend **never** triggers a call to an external API: it always reads
Redis. The worker feeds the cache in the background.
t 1.
This card only sets up the client and the cache. Their actual use arrives with
the widgets (Phase 2) and the Timer (Phase 3).

---

## 2. Relevant Files

| File | Purpose |
|---|---|
| `server/src/lib/redis.ts` | Client, ping, self test, cache helpers, BullMQ connection |
| `server/src/index.ts` | Connection at startup, `/health`, clean shutdown |
| `server/package.json` | `ioredis` dependency |

No change in `docker-compose.yml` or `.env`: the `redis` service and the
`REDIS_URL` variable have existed since Phase 0.

```bash
REDIS_URL=redis://redis:6379
```

`redis` is the **service name** in `docker-compose.yml`, resolved by Docker's
internal DNS, exactly like `db` for PostgreSQL or `mailhog` for SMTP.

---

## 3. Library Choice: ioredis

| Criterion | `redis` (official) | **`ioredis`** |
|---|---|---|
| BullMQ compatible | No | **Yes, required** |
| Automatic reconnection | Yes | Yes, configurable strategy |
| TypeScript support | Yes | Yes |
| Cluster and Sentinel | Yes | Yes |

The choice is driven by Phase 3: **BullMQ, which will run the Timer, is built
on ioredis** and only works with it. Choosing the official package would have
meant two different Redis libraries in the same project, with two
configurations to maintain.

One library, one configuration file.

---

## 4. The Client

### Lazy Connection

```ts
const BASE_OPTIONS: RedisOptions = {
  lazyConnect: true,
  retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
};
```

`lazyConnect: true` prevents any connection when the module is imported. The
connection only opens on an explicit call to `connectRedis()`, at server
startup.

Without this option, simply importing the file would open a network
connection, an invisible side effect, which would make the module impossible
to import in a script or a test without an available Redis.

### Reconnection Strategy

```ts
retryStrategy: (attempt) => Math.min(attempt * 200, 2000)
```

| Attempt | Delay |
|---|---|
| 1 | 200 ms |
| 2 | 400 ms |
| 5 | 1 s |
| 10 and beyond | 2 s (cap) |

The delay grows progressively, then caps at 2 seconds. Retrying immediately in
a loop would hammer a restarting Redis; waiting too long would needlessly
delay recovery.

### Limiting Request Waiting

```ts
export const redis = new Redis(REDIS_URL, {
  ...BASE_OPTIONS,
  maxRetriesPerRequest: 3,
});
```

By default, ioredis queues commands during an outage and replays them on
reconnection. Without a limit, **an HTTP request could stay blocked
indefinitely** waiting for a Redis that is down.

With `maxRetriesPerRequest: 3`, a command fails after three reconnection
attempts. The HTTP request then gets a response, degraded but fast.

### The Error Listener

```ts
redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});
```

Without a listener, ioredis prints an "Unhandled error event" warning on every
failed reconnection attempt. The listener replaces this noise with a clear,
prefixed message.

---

## 5. The SET/GET Self-Test

```ts
export async function redisSelfTest(): Promise<void> {
  const key = `healthcheck:${process.pid}:${Date.now()}`;
  const value = "ok";

  await redis.set(key, value, "EX", 10);
  const read = await redis.get(key);
  await redis.del(key);

  if (read !== value) {
    throw new Error(`Redis self-test failed: ...`);
  }
}
```

### Why Not a Simple PING

A `PING` proves that the network connection is open. It does not prove that
the application can **write and then read back data**; which is exactly what
the cache will need.

A Redis that is read-only, full, or misconfigured would answer `PONG` but
refuse writes. The full SET -> GET -> comparison round trip detects these cases.

### Precautions on the Test Key

| Precaution | Reason |
|---|---|
| `healthcheck:` prefix | Identifiable, impossible to confuse with business data |
| `process.pid` + timestamp | Unique: two servers starting at once do not collide |
| 10 s expiry (`EX 10`) | If the server crashes between SET and DEL, the key disappears on its own |
| Explicit `DEL` | Immediate cleanup in the normal case |

The double protection : explicit deletion **and** expiry, guarantees that no
test key ever accumulates, even after a crash.

### Deliberate Failure at Startup

If the self test fails, the server **refuses to start**. A visible failure at
launch is better than a server that starts and then serves data that is never
cached.

---

## 6. The Cache Helpers

```ts
cacheGet<T>(key)                       // reads, returns null if absent
cacheSet(key, value, ttlSeconds)       // writes JSON with expiry
cacheDelete(key)                       // deletes
```

### JSON Storage

Redis only stores strings. The helpers serialize and deserialize
automatically:

```ts
await cacheSet("widget:42", { city: "Paris", temp: 16.4 }, 300);
const data = await cacheGet<{ city: string; temp: number }>("widget:42");
```

Callers manipulate typed objects, never raw text.

### Mandatory Expiry

```ts
export async function cacheSet(key: string, value: unknown, ttlSeconds: number)
```

The `ttlSeconds` parameter is **not optional**. An entry with no expiry would
serve stale data indefinitely if its refresh job ever stopped: the user would
see three week old weather with no error signal at all.

Making the expiry mandatory in the signature makes this mistake impossible.

### Controlled Degradation

```ts
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    console.error(`[redis] cacheGet failed for ${key}:`, ...);
    return null;
  }
}
```

This is the most important choice in the file. **Redis errors are absorbed**,
never propagated:

| Situation | Behavior |
|---|---|
| Missing key | `null` (cache miss) |
| Redis down | `null` as well, error logged |
| Write impossible | Nothing, error logged |

The cache is an **optimization**, not a feature. A Redis outage should slow
the application down, not break it. A failed read behaves exactly like data
missing from the cache: the caller already knows how to handle that case.

Deliberate counterpoint: the startup self-test, on the other hand, **throws**
an exception. At launch, we want to know immediately whether Redis works; at
runtime, we want to survive a transient outage.

---

## 7. The Dedicated BullMQ Connection

```ts
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, {
    ...BASE_OPTIONS,
    maxRetriesPerRequest: null,
  });
}
```

BullMQ requires **separate** connections with `maxRetriesPerRequest: null`.
Its blocking commands wait indefinitely for new jobs, which is incompatible
with the 3 attempt limit of the application client.

Using the same client for both would make BullMQ fail at startup.

This function is not called yet: it serves Phase 3. It is written now so that
**all Redis configuration stays in a single file**.

---

## 8. Server Integration

### Startup Sequence

```
1. runMigrations()            updates the schema
2. syncRegistryToDatabase()   reflects the registry in the tables
3. connectRedis()             opens the Redis connection
   redisSelfTest()            proves a SET/GET round trip
4. app.listen(8080)           accepts requests
```

The server accepts no request until **all** its dependencies are ready and
verified.

### The `/health` Route

```ts
app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([ping(), pingRedis()]);
  const ok = dbOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    database: dbOk,
    redis: redisOk,
  });
});
```

| State | Code | Response |
|---|---|---|
| Everything works | `200` | `{"status":"ok","database":true,"redis":true}` |
| Redis down | `503` | `{"status":"degraded","database":true,"redis":false}` |

Both checks run **in parallel** (`Promise.all`): the route answers in a single
network round trip instead of two.

The response states **which** dependency is down, which avoids having to open
`psql` or `redis-cli` to diagnose.

### Clean Shutdown

```ts
await Promise.allSettled([closePool(), closeRedis()]);
```

`allSettled` rather than `all`: if closing PostgreSQL fails, closing Redis must
still happen. `Promise.all` would stop at the first error and leave the second
connection open.

`closeRedis()` sends `QUIT` rather than cutting the socket abruptly: Redis
finishes the commands in progress before closing.

---

## 9. Tests

### Prerequisite

`package.json` changed: the image must be rebuilt.

```bash
docker-compose up -d --build server
docker-compose logs -f server
```

### 1. Startup Self-Test : Card Criterion

Expected logs:

```
[migrate] database is up to date (1 migration(s) applied)
[db] registry synchronized: 1 service(s), 2 widget(s)
[redis] connected, SET/GET self-test passed
Server listening on port 8080
```

The `SET/GET self-test passed` line proves that the application code wrote and
then read back data in the Redis container.

### 2. Dependency Status

```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok","database":true,"redis":true}`

### 3. No Leftover Test Keys

```bash
docker-compose exec redis redis-cli KEYS 'healthcheck:*'
```

Expected: `(empty array)`. The self-test cleans up after itself.

> `KEYS` scans the whole database: fine for a one-off check, never to be used
> in application code on a large database.

### 4. Verify Direct Access to Redis

```bash
docker-compose exec redis redis-cli PING
docker-compose exec redis redis-cli SET test:manual "hello" EX 60
docker-compose exec redis redis-cli GET test:manual
docker-compose exec redis redis-cli TTL test:manual
```

Expected: `PONG`, `OK`, `"hello"`, then a number of remaining seconds below 60.

### 5. Resilience: Redis Outage

```bash
docker-compose stop redis
curl http://localhost:8080/health
```

Expected: `503 {"status":"degraded","database":true,"redis":false}`.
**The server stays online** and reports the outage instead of stopping.

In the logs, a line appears on each reconnection attempt:

```
[redis] connection error: getaddrinfo EAI_AGAIN redis
```

This is the expected behavior: Docker removed the `redis` name from its
internal DNS, and ioredis retries every two seconds at most.

### 6. Resilience: Automatic Reconnection

```bash
docker-compose start redis
sleep 3
curl http://localhost:8080/health
```

Expected: `200 {"status":"ok","database":true,"redis":true}`, **without
restarting the server**.

Check that the errors have stopped:

```bash
docker-compose logs --tail=5 server
```

No new `EAI_AGAIN` line should appear.

### Summary

| # | Test | Expected |
|---|---|---|
| 1 | Startup | `SET/GET self-test passed` |
| 2 | `/health` | `200`, `redis: true` |
| 3 | Leftover keys | `(empty array)` |
| 4 | Direct `redis-cli` access | `PONG`, correct read and TTL |
| 5 | Redis stopped | `503 degraded`, server still online |
| 6 | Redis restarted | `200`, reconnection without restarting the server |

Tests 5 and 6 make the most convincing live demonstration: Redis goes down,
the API keeps answering and reports it, then recovers on its own.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module 'ioredis'` | Image not rebuilt | `docker-compose up -d --build server` |
| `EAI_AGAIN redis` at startup | Redis container missing | `docker-compose up -d redis` |
| `EAI_AGAIN` that never stops after a `start` | Inconsistent Docker network | `docker-compose down && docker-compose up -d` |
| `ECONNREFUSED` | Redis not ready yet | Wait for the healthcheck, then `docker-compose restart server` |
| Server does not start, `self-test failed` | Redis refuses writes | `docker-compose exec redis redis-cli INFO persistence` |

---

## 11. Remaining Work

| Item | Card |
|---|---|
| Caching widget responses | Phase 2 |
| Storing the OAuth `state` in Redis instead of memory | Phase 2 |
| BullMQ worker through `createRedisConnection()` | Phase 3 |
| Re-enabling the `worker` service in `docker-compose.yml` | Phase 3 |

Storing the OAuth `state` deserves a specific mention: it currently lives in
the process memory, which makes it disappear on every server restart. Redis,
with its native expiry, is the natural place for this kind of temporary data.
