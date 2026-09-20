import { Pool, PoolClient, QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] error on an idle connection:", err.message);
});

/*
 Pass values as parameters ($1, $2, ...) and never through string
 concatenation: this protects against SQL injection.
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/*
 Multiple queries committed together or all rolled back.
 Essential whenever an operation affects multiple tables.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    // Without release(), the connection never returns to the pool
    // and the application eventually becomes blocked.
    client.release();
  }
}

export async function ping(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function waitForDatabase(retries = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (await ping()) return;
    console.log(`[db] waiting for PostgreSQL (${attempt}/${retries})...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`PostgreSQL is unreachable after ${retries} attempts.`);
}

export async function closePool(): Promise<void> {
  await pool.end();
}
