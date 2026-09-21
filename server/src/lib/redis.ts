import Redis, { RedisOptions } from "ioredis";

// Redis client.

const REDIS_URL = process.env.REDIS_URL ?? "redis://redis:6379";

/*
 Shared connection options.
 */
const BASE_OPTIONS: RedisOptions = {
  lazyConnect: true,
  // Reconnect with a growing delay, capped at 2 seconds, instead of
  // hammering a Redis instance that is restarting.
  retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
};

/** The application client, shared by the whole server process. */
export const redis = new Redis(REDIS_URL, {
  ...BASE_OPTIONS,
  // A command fails after 3 reconnection attempts instead of waiting
  // indefinitely: an HTTP request must never hang because Redis is down.
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  // Without a listener, ioredis prints an "Unhandled error event" on every
  // failed reconnection attempt.
  console.error("[redis] connection error:", err.message);
});

/*
 Creates a dedicated connection.
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, {
    ...BASE_OPTIONS,
    maxRetriesPerRequest: null,
  });
}

/* Opens the connection. Called once at server startup. */
export async function connectRedis(): Promise<void> {
  if (redis.status === "ready" || redis.status === "connecting") {
    return;
}
  await redis.connect();
}

/* Returns true if Redis answers PING. Used by /health. */
export async function pingRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

/*
 Startup self-test: writes a key, reads it back, deletes it.
 */
export async function redisSelfTest(): Promise<void> {
  const key = `healthcheck:${process.pid}:${Date.now()}`;
  const value = "ok";

  await redis.set(key, value, "EX", 10);
  const read = await redis.get(key);
  await redis.del(key);
  if (read !== value) {
    throw new Error(`Redis self-test failed: expected "${value}", got "${read}"`);
  }
}

// Cache helpers
// Values are stored as JSON with a mandatory TTL. 

/* Reads a cached value. Returns null on a miss or if Redis is unavailable. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch (err) {
    console.error(`[redis] cacheGet failed for ${key}:`, (err as Error).message);
    return null;
  }
}

/*
 Stores a value for ttlSeconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`[redis] cacheSet failed for ${key}:`, (err as Error).message);
  }
}

/** Removes a cached value, for example when a widget instance is deleted. */
export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`[redis] cacheDelete failed for ${key}:`, (err as Error).message);
  }
}

/** Closes the connection cleanly. Called on SIGINT / SIGTERM. */
export async function closeRedis(): Promise<void> {
  if (redis.status === "end") {
  return;
  }
  await redis.quit();
}