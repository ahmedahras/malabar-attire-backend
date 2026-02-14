import { startJobSystem, stopJobSystem } from "./jobs";
import { logger } from "./utils/logger";

const shutdown = async (signal: string) => {
  logger.warn({ signal }, "Worker shutdown initiated");
  const timeout = setTimeout(() => {
    logger.error({ signal }, "Worker shutdown timeout");
    process.exit(1);
  }, 15_000);

  try {
    await stopJobSystem();
    clearTimeout(timeout);
    logger.info({ signal }, "Worker shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error, signal }, "Worker shutdown failed");
    process.exit(1);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startJobSystem().catch((error) => {
  logger.error({ err: error }, "Worker failed to start");
  process.exit(1);
});
