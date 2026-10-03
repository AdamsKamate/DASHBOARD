import { Queue, RepeatableJob } from "bullmq";
import { createRedisConnection } from "../lib/redis";
import { query } from "../db/index";
import type { WidgetParams } from "../db/repositories/widgets";

// The refresh queue (C9)

export const REFRESH_QUEUE_NAME = "widget-refresh";

/* What a job carries. Kept small: Redis holds this, not the database */
export interface RefreshJobData {
  widgetId: string;
  userId: string;
  widgetTypeId: string;
  params: WidgetParams;
}

/*
 BullMQ requires maxRetriesPerRequest: null on its connections, which
 createRedisConnection already sets. 
 */
let queueInstance: Queue<RefreshJobData> | null = null;

export function getRefreshQueue(): Queue<RefreshJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<RefreshJobData>(REFRESH_QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        // Keep a short history: enough to diagnose, not enough to fill Redis
        removeOnComplete: 20,
        removeOnFail: 50,
        // One retry, quickly: a third party API that fails twice in ten
        // seconds will not succeed on a third attempt either, and the next
        // tick is coming anyway
        attempts: 2,
        backoff: { type: "fixed", delay: 5_000 },
      },
    });
  }
  return queueInstance;
}

/*
 The job identifier of an instance.
 */
function jobIdFor(widgetId: string): string {
  return `widget:${widgetId}`;
}

/*
 Schedules, or re-schedules, the refresh of one instance.
 */
export async function scheduleWidgetRefresh(
  widgetId: string,
  userId: string,
  widgetTypeId: string,
  params: WidgetParams,
  refreshRateSeconds: number
): Promise<void> {
  const queue = getRefreshQueue();

  // Removed first: BullMQ keys a repeatable job by its name, pattern and
  // identifier, so changing the interval would otherwise leave the old
  // schedule running next to the new one
  await removeWidgetRefresh(widgetId);
  await queue.add(
    REFRESH_QUEUE_NAME,
    { widgetId, userId, widgetTypeId, params },
    {
      jobId: jobIdFor(widgetId),
      repeat: { every: refreshRateSeconds * 1000 },
    }
  );
}

/* Removes the schedule of an instance, on deletion. */
export async function removeWidgetRefresh(widgetId: string): Promise<void> {
  const queue = getRefreshQueue();
  const repeatableJobs: RepeatableJob[] = await queue.getRepeatableJobs();
  for (const repeatableJob of repeatableJobs) {
    if (repeatableJob.id === jobIdFor(widgetId)) {
      await queue.removeRepeatableByKey(repeatableJob.key);
    }
  }
}

interface WidgetInstanceRow {
  id: string;
  user_id: string;
  widget_type_id: string;
  params: WidgetParams;
  refresh_rate: number;
}

/*
 Reconciles the schedule in Redis with the instances in the database
 */
export async function syncJobsWithDatabase(): Promise<{
  scheduled: number;
  removed: number;
  total: number;
}> {
  const queue = getRefreshQueue();

  const instances = await query<WidgetInstanceRow>(
    `SELECT id, user_id, widget_type_id, params, refresh_rate FROM widget_instances`
  );
  const existingJobs: RepeatableJob[] = await queue.getRepeatableJobs();
  const existingJobIds = new Map<string | undefined, RepeatableJob>(
    existingJobs.map((job) => [job.id, job])
  );

  let scheduled = 0;
  let removed = 0;
  for (const instance of instances) {
    const jobId = jobIdFor(instance.id);
    const existingJob = existingJobIds.get(jobId);
    const expectedInterval = instance.refresh_rate * 1000;

    // Rescheduled only when missing or out of date: re-adding every job at
    // each boot would reset their timers, and a widget set to one hour would
    // never fire if the worker restarted often.
    if (!existingJob || Number(existingJob.every) !== expectedInterval) {
      await scheduleWidgetRefresh(
        instance.id,
        instance.user_id,
        instance.widget_type_id,
        instance.params,
        instance.refresh_rate
      );
      scheduled += 1;
    }
    existingJobIds.delete(jobId);
  }

  // Whatever is left has no instance behind it: a widget deleted while the
  // worker was down
  for (const orphanJob of existingJobIds.values()) {
    await queue.removeRepeatableByKey(orphanJob.key);
    removed += 1;
  }
  return { scheduled, removed, total: instances.length };
}

export async function closeRefreshQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
