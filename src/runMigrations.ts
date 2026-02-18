import "dotenv/config";
import dotenv from "dotenv";
import { Client } from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { databaseEnvHint, resolveDatabaseUrlFromEnv } from "./config/databaseUrl";

dotenv.config({ override: false });

// 🔎 DEBUG: confirm this file actually runs
console.log("🚀 runMigrations starting...");

// Backup strategy (ops):
// - Run automated full backups daily.
// - Perform a monthly restore test to validate recovery.

const runMigrations = async () => {
  const databaseUrl = resolveDatabaseUrlFromEnv();

  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is not set. ${databaseEnvHint}`);
  }

  if (/\s/.test(databaseUrl)) {
    throw new Error(
      "DATABASE_URL contains whitespace. Remove spaces or quotes in your .env value."
    );
  }

  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      "DATABASE_URL must start with postgresql:// (or postgres://). Check for quotes or spaces."
    );
  }

  const migrationsDir = path.resolve(__dirname, "..", "migrations");

  console.log("📂 Looking for migrations in:", migrationsDir);

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  console.log("📜 Found migration files:", files);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );

    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    console.log("✅ Already applied migrations:", [...applied]);

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭ Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`➡️ Running migration: ${file}`);

      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");

      if (!sql.trim()) {
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [file]
        );
        console.log(`⚠️ Empty migration file marked as applied: ${file}`);
        continue;
      }

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
          [file]
        );

        await client.query("COMMIT");

        console.log(`✅ Applied migration: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error(`❌ Migration failed: ${file}`);
        throw error;
      }
    }

    console.log("🎉 All migrations complete.");
  } finally {
    await client.end();
  }
};

runMigrations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
