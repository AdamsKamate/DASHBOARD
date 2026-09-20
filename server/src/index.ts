import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import aboutRouter from "./routes/about";
import authRouter from "./routes/auth";
import { runMigrations } from "./db/migrate";
import { syncRegistryToDatabase } from "./db/repositories/services";
import { ping, closePool } from "./db";

const app = express();
const PORT = 8080; // required by the assignment, do not make configurable

// Required for req.ip to return the client's real IP behind Docker,
// rather than the internal IP of the container network.
app.set("trust proxy", true);

app.use(express.json());
// Parses the token cookie set by the login route into req.cookies.
app.use(cookieParser());
app.use(aboutRouter);
app.use(authRouter);

// Check that the database responds without opening psql.
app.get("/health", async (_req, res) => {
  const dbOk = await ping();
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? "ok" : "degraded", database: dbOk });
});

/*
 Startup in three steps:
 1. migrations: update the schema without destroying data
 2. registry: reflect ServiceProviders in services/widget_types
 3. HTTP listener: start only once the database is ready
 */
async function start() {
  try {
    await runMigrations();
    await syncRegistryToDatabase();

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`about.json: http://localhost:${PORT}/about.json`);
    });
  } catch (err) {
    console.error("[server] startup failed:", (err as Error).message);
    await closePool();
    process.exit(1);
  }
}

// Shutdown: release PostgreSQL connections.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`\n[server] ${signal} received, shutting down...`);
    await closePool();
    process.exit(0);
  });
}

start();