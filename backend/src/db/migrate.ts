import fs from "fs";
import path from "path";
import { pool } from "./pool";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const BOOTSTRAP_VERSION = "000_migrations_table";

function listMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function ensureMigrationsTable() {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, `${BOOTSTRAP_VERSION}.sql`),
    "utf-8"
  );
  await pool.query(sql);
  const result = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE version = $1",
    [BOOTSTRAP_VERSION]
  );
  if (result.rowCount === 0) {
    console.log(`Applying ${BOOTSTRAP_VERSION}...`);
    await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [
      BOOTSTRAP_VERSION,
    ]);
    console.log(`Applied ${BOOTSTRAP_VERSION}`);
  } else {
    console.log(`Skipping ${BOOTSTRAP_VERSION} (already applied)`);
  }
}

async function getAppliedVersions(): Promise<Set<string>> {
  const result = await pool.query<{ version: string }>(
    "SELECT version FROM schema_migrations"
  );
  return new Set(result.rows.map((row) => row.version));
}

async function runMigration(file: string, version: string) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1)",
      [version]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  await ensureMigrationsTable();
  const applied = await getAppliedVersions();

  const files = listMigrationFiles().filter(
    (f) => path.basename(f, ".sql") !== BOOTSTRAP_VERSION
  );

  let ranCount = 0;
  for (const file of files) {
    const version = path.basename(file, ".sql");
    if (applied.has(version)) {
      console.log(`Skipping ${version} (already applied)`);
      continue;
    }
    console.log(`Applying ${version}...`);
    await runMigration(file, version);
    console.log(`Applied ${version}`);
    ranCount++;
  }

  if (ranCount === 0) {
    console.log("Nothing to apply.");
  }
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
