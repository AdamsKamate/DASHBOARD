import { query, queryOne } from "../index";

// Widget instances and their cached data.
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type WidgetParams = Record<string, string | number>;

/* A row of widget_instances, as stored. */
interface WidgetInstanceRow {
  id: string;
  widget_type_id: string;
  params: WidgetParams;
  refresh_rate: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

/* An instance in the shape API.md describes. */
export interface WidgetInstance {
  id: string;
  widgetTypeId: string;
  params: WidgetParams;
  refreshRate: number;
  position: WidgetPosition;
}

export interface CachedWidgetData {
  data: Record<string, unknown> | null;
  status: "ok" | "pending" | "error";
  error: string | null;
  fetchedAt: Date | null;
}

function toWidgetInstance(row: WidgetInstanceRow): WidgetInstance {
  return {
    id: row.id,
    widgetTypeId: row.widget_type_id,
    // Stored as JSONB: node-postgres parses it, so no JSON.parse here.
    params: row.params,
    refreshRate: row.refresh_rate,
    position: { x: row.position_x, y: row.position_y, w: row.width, h: row.height },
  };
}

const INSTANCE_COLUMNS = `id, widget_type_id, params, refresh_rate,
                          position_x, position_y, width, height`;

/* Every instance of a user, oldest first so the order stays stable. */
export async function listUserWidgets(userId: string): Promise<WidgetInstance[]> {
  const rows = await query<WidgetInstanceRow>(
    `SELECT ${INSTANCE_COLUMNS} FROM widget_instances
      WHERE user_id = $1
      ORDER BY created_at`,
    [userId]
  );
  return rows.map(toWidgetInstance);
}

/* One instance, or null when it does not exist OR belongs to someone else. */
export async function findUserWidget(
  userId: string,
  widgetId: string
): Promise<WidgetInstance | null> {
  const row = await queryOne<WidgetInstanceRow>(
    `SELECT ${INSTANCE_COLUMNS} FROM widget_instances
      WHERE id = $1 AND user_id = $2`,
    [widgetId, userId]
  );
  return row ? toWidgetInstance(row) : null;
}

export interface CreateWidgetInput {
  widgetTypeId: string;
  params: WidgetParams;
  refreshRate: number;
  position: WidgetPosition;
}

export async function createWidget(
  userId: string,
  input: CreateWidgetInput
): Promise<WidgetInstance> {
  const row = await queryOne<WidgetInstanceRow>(
    `INSERT INTO widget_instances
       (user_id, widget_type_id, params, refresh_rate, position_x, position_y, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${INSTANCE_COLUMNS}`,
    [
      userId,
      input.widgetTypeId,
      // Serialised explicitly: passing an object to a JSONB column works, but
      // being explicit avoids surprises with arrays and null.
      JSON.stringify(input.params),
      input.refreshRate,
      input.position.x,
      input.position.y,
      input.position.w,
      input.position.h,
    ]
  );
  return toWidgetInstance(row!);
}

export interface UpdateWidgetInput {
  params?: WidgetParams;
  refreshRate?: number;
  position?: WidgetPosition;
}

/*
 Updates only the fields provided.
 */
export async function updateWidget(
  userId: string,
  widgetId: string,
  input: UpdateWidgetInput
): Promise<WidgetInstance | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];

  const addAssignment = (column: string, value: unknown) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (input.params !== undefined) {
    addAssignment("params", JSON.stringify(input.params));
  }
  if (input.refreshRate !== undefined) {
    addAssignment("refresh_rate", input.refreshRate);
  }
  if (input.position !== undefined) {
    addAssignment("position_x", input.position.x);
    addAssignment("position_y", input.position.y);
    addAssignment("width", input.position.w);
    addAssignment("height", input.position.h);
  }

  if (assignments.length === 0) {
    // Nothing to change: return the instance as it is rather than running an
    // empty UPDATE, which PostgreSQL would reject.
    return findUserWidget(userId, widgetId);
  }

  values.push(widgetId, userId);

  const row = await queryOne<WidgetInstanceRow>(
    `UPDATE widget_instances
        SET ${assignments.join(", ")}
      WHERE id = $${values.length - 1} AND user_id = $${values.length}
      RETURNING ${INSTANCE_COLUMNS}`,
    values
  );
  return row ? toWidgetInstance(row) : null;
}

/* Deletes an instance. The cache row goes with it (ON DELETE CASCADE). */
export async function deleteWidget(userId: string, widgetId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM widget_instances WHERE id = $1 AND user_id = $2 RETURNING id`,
    [widgetId, userId]
  );
  return rows.length > 0;
}

// Cached data

interface WidgetCacheRow {
  data: Record<string, unknown> | null;
  status: "ok" | "pending" | "error";
  error: string | null;
  fetched_at: Date | null;
}

/*
 The cached data of an instance.
 */
export async function findWidgetCache(widgetId: string): Promise<CachedWidgetData> {
  const row = await queryOne<WidgetCacheRow>(
    `SELECT data, status, error, fetched_at FROM widget_cache WHERE instance_id = $1`,
    [widgetId]
  );
  if (!row) {
    return { data: null, status: "pending", error: null, fetchedAt: null };
  }
  return { data: row.data, status: row.status, error: row.error, fetchedAt: row.fetched_at };
}

/* Stores a successful refresh. */
export async function saveWidgetData(
  widgetId: string,
  data: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO widget_cache (instance_id, data, status, error, fetched_at)
     VALUES ($1, $2, 'ok', NULL, now())
     ON CONFLICT (instance_id)
     DO UPDATE SET data = EXCLUDED.data, status = 'ok', error = NULL, fetched_at = now()`,
    [widgetId, JSON.stringify(data)]
  );
}

/*
Stores a failed refresh, keeping the previous data.
 */
export async function saveWidgetError(widgetId: string, message: string): Promise<void> {
  await query(
    `INSERT INTO widget_cache (instance_id, data, status, error, fetched_at)
     VALUES ($1, NULL, 'error', $2, now())
     ON CONFLICT (instance_id)
     DO UPDATE SET status = 'error', error = EXCLUDED.error, fetched_at = now()`,
    [widgetId, message]
  );
}

/*
 Empties the cache of an instance.
 */
export async function clearWidgetCache(widgetId: string): Promise<void> {
  await query(`DELETE FROM widget_cache WHERE instance_id = $1`, [widgetId]);
}