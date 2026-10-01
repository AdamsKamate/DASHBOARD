import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import aboutRouter, { checkRegistryQuota } from "./routes/about";
import authRouter from "./routes/auth";
import oauthRouter from "./routes/oauth";
import { runMigrations } from "./db/migrate";
import { syncRegistryToDatabase } from "./db/repositories/services";
import { ping, closePool } from "./db";
import { connectRedis, redisSelfTest, pingRedis, closeRedis } from "./lib/redis";

const app = express();
const PORT = 8080; // required by the assignment, do not make configurable

// Required for req.ip to return the client's real IP behind Docker,
app.set("trust proxy", true);
const allowedOrigin = process.env.CLIENT_URL ?? "http://localhost:8081";
app.use(cors({ origin: allowedOrigin, credentials: true }));

app.use(express.json());
// Parses the token cookie set by the login route into req.cookies.
app.use(cookieParser());
app.use(aboutRouter);
app.use(authRouter);
app.use(oauthRouter);

// Check that the database and Redis respond without opening psql or redis-cli.
app.get("/health", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([ping(), pingRedis()]);
  const ok = dbOk && redisOk;
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    database: dbOk,
    redis: redisOk,
  });
});

/*
 Unknown route: answer JSON, like every other route.
 */
app.use((req, res) => {
  res.status(404).json({ error: `Unknown route: ${req.method} ${req.path}` });
});

/*
 Startup in four steps:
 1. migrations: update the schema without destroying data
 2. registry: reflect ServiceProviders in services/widget_types
 3. Redis: connect, then prove a real SET/GET round trip works
 4. HTTP listener: start only once every dependency is ready
 */
async function start() {
  try {
    await runMigrations();
    await syncRegistryToDatabase();
    checkRegistryQuota();
    await connectRedis();
    await redisSelfTest();
    console.log("[redis] connected, SET/GET self-test passed");
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`about.json: http://localhost:${PORT}/about.json`);
    });
  } catch (err) {
    console.error("[server] startup failed:", (err as Error).message);
    await closePool();
    await closeRedis().catch(() => undefined);
    process.exit(1);
  }
}

// Shutdown: release PostgreSQL and Redis connections
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    await Promise.allSettled([closePool(), closeRedis()]);
    process.exit(0);
  });
}

start();