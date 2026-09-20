import fs from "fs";
import path from "path";
import { pool, waitForDatabase } from "./index";

// Each file in migrations/ is run once, and its name is recorded in
// schema_migrations. New files are applied automatically at the next startup
// without destroying existing data.
//
// Rule: NEVER edit a migration that has already been applied.
// Create a new one instead (002_, 003_, ...).

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations"
  );
  return new Set(result.rows.map((r) => r.name));
}

function migrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // Alphabetical order guarantees 001_ comes before 002_.
}

/**
   * One transaction per migration: if an instruction fails, the entire
   * migration is rolled back and nothing is recorded. Fix it and run again.
 */
export async function runMigrations(): Promise<void> {
  await waitForDatabase();
  await ensureMigrationsTable();

  const already = await appliedMigrations();
  const files = migrationFiles();
  const pending = files.filter((f) => !already.has(f));

  if (pending.length === 0) {
    console.log(`[migrate] database is up to date (${files.length} migration(s) applied)`);
    return;
  }

  console.log(`[migrate] applying ${pending.length} migration(s)`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[migrate] ${file} applied`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[migrate] failed on ${file}:`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log("[migrate] completed");
}

// Run migrations alone with: npm run migrate
if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
