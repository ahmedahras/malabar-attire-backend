import "dotenv/config";
import dotenv from "dotenv";
import { Client } from "pg";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { databaseEnvHint, resolveDatabaseUrlFromEnv } from "./config/databaseUrl";

dotenv.config({ override: false });

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
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");
      if (!sql.trim()) {
        continue;
      }
      await client.query(sql);
      // eslint-disable-next-line no-console
      console.log(`Applied migration: ${file}`);
    }
  } finally {
    await client.end();
  }
};

runMigrations().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Migration failed:", error);
  process.exit(1);
});
