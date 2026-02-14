import "dotenv/config";
import { createApp } from "./app";
import { env } from "./config/env";
import { startJobSystem, stopJobSystem } from "./jobs";
import { logger } from "./utils/logger";
import { db } from "./db/pool";

const app = createApp();
let server: ReturnType<typeof app.listen> | null = null;

const startServer = async () => {
  logger.info({ pid: process.pid, port: env.PORT }, "Server starting");
  logger.info("DB CONNECT ATTEMPT");
  try {
    const client = await db.connect();
    client.release();
    logger.info("DB CONNECTED");
  } catch (error) {
    logger.error({ err: error }, "DB CONNECT FAILED");
    process.exit(1);
  }

  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API listening");
  });

  startJobSystem().catch((error) => {
    logger.error({ err: error }, "Job system failed to start");
  });
};

const shutdown = async (signal: string) => {
  logger.warn({ signal }, "Graceful shutdown initiated");
  const timeout = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown timeout");
    process.exit(1);
  }, 15_000);

  try {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
    await stopJobSystem();
    await db.end();
    clearTimeout(timeout);
    logger.info({ signal }, "Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, "Graceful shutdown failed");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
