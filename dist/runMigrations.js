"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ override: true });
// Backup strategy (ops):
// - Run automated full backups daily.
// - Perform a monthly restore test to validate recovery.
const runMigrations = async () => {
    const rawUrl = process.env.DATABASE_URL ?? "";
    const databaseUrl = rawUrl.trim().replace(/^['"]|['"]$/g, "");
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not set. Expected format: postgresql://user:password@host:5432/dbname");
    }
    if (/\s/.test(databaseUrl)) {
        throw new Error("DATABASE_URL contains whitespace. Remove spaces or quotes in your .env value.");
    }
    if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
        throw new Error("DATABASE_URL must start with postgresql:// (or postgres://). Check for quotes or spaces.");
    }
    const migrationsDir = path_1.default.resolve(__dirname, "..", "migrations");
    const files = (await (0, promises_1.readdir)(migrationsDir))
        .filter((file) => file.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    const client = new pg_1.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        for (const file of files) {
            const fullPath = path_1.default.join(migrationsDir, file);
            const sql = await (0, promises_1.readFile)(fullPath, "utf8");
            if (!sql.trim()) {
                continue;
            }
            await client.query(sql);
            // eslint-disable-next-line no-console
            console.log(`Applied migration: ${file}`);
        }
    }
    finally {
        await client.end();
    }
};
runMigrations().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Migration failed:", error);
    process.exit(1);
});
//# sourceMappingURL=runMigrations.js.map