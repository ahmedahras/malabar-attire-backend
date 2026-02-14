import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 50,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000
});

db.on("error", (error) => {
  logger.error({ err: error }, "DB pool error");
});
