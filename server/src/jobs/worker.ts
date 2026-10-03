import { Worker, Job } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { waitForDatabase, closePool } from "../db/index";
import { syncRegistryToDatabase } from "../db/repositories/services";
import { refreshWidget } from "./refreshWidget";
import {
  REFRESH_QUEUE_NAME,
  RefreshJobData,
  closeRefreshQueue,
  syncJobsWithDatabase,
} from "./queue";

// The refresh worker

/*
  How many refreshes run at once
 */
const CONCURRENCY = 5;

async function processRefreshJob(job: Job<RefreshJobData>): Promise<void> {
  const { widgetId, userId, widgetTypeId, params } = job.data;
  const startedAt = Date.now();
  const result = await refreshWidget(userId, widgetId, widgetTypeId, params);
  const elapsedMs = Date.now() - startedAt;

  // One line per run, with the outcome: this log is how the team sees that
  // the Timer is alive without opening the database
  if (result.status === "ok") {
    console.log(`[worker] ${widgetTypeId} ${widgetId} refreshed in ${elapsedMs} ms`);
  } else {
    console.warn(`[worker] ${widgetTypeId} ${widgetId} failed in ${elapsedMs} ms: ${result.error}`);
  }
  // refreshWidget never throws: it stores the failure as an "error" status.
  // Throwing here would make BullMQ retry a city that will never exist
}

async function main(): Promise<void> {
  console.log("[worker] starting");

  // Same order as the server: nothing is scheduled before its dependencies
  // answer
  await waitForDatabase();
  console.log("[worker] database ready");

  // The worker can boot before the server on a cold start, so it makes sure
  // the services and widget types exist rather than assuming
  await syncRegistryToDatabase();
  const { scheduled, removed, total } = await syncJobsWithDatabase();
  console.log(
    `[worker] ${total} widget instance(s): ${scheduled} job(s) scheduled, ${removed} orphan(s) removed`
  );
  const worker = new Worker<RefreshJobData>(REFRESH_QUEUE_NAME, processRefreshJob, {
    connection: createRedisConnection(),
    concurrency: CONCURRENCY,
  });

  worker.on("failed", (job, error) => {
    // Reached only on an unexpected failure, since refreshWidget swallows the
    // ones it knows about
    console.error(`[worker] job ${job?.id} failed unexpectedly:`, error.message);
  });

  worker.on("error", (error) => {
    // A connection problem, typically. Logged without stopping the process:
    // ioredis reconnects on its own
    console.error("[worker] worker error:", error.message);
  });

  console.log(`[worker] listening on "${REFRESH_QUEUE_NAME}", concurrency ${CONCURRENCY}`);

  /*
   A refresh in flight must finish before the process exits, otherwise its
   widget keeps a stale cache and the job is left marked as active in Redis.
   worker.close() waits for that
   */
  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal} received, shutting down...`);
    await worker.close();
    await closeRefreshQueue();
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(async (error) => {
  console.error("[worker] failed to start:", error);
  await closePool().catch(() => undefined);
  process.exit(1);
});