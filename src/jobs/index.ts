import { env } from "../config/env";
import { logger } from "../utils/logger";

export const startJobSystem = async () => {
  if (process.env.JOBS_ENABLED === "false" || !env.JOBS_ENABLED) {
    logger.warn({ jobId: "jobs-disabled" }, "Jobs disabled (local dev mode)");
    return;
  }

  const { registerScheduledJobs } = await import("./scheduler");
  const { workers } = await import("./workers");

  await registerScheduledJobs();
  workers.forEach((worker) => {
    worker.on("failed", () => {});
  });
};

export const stopJobSystem = async () => {
  const { shutdownWorkers } = await import("./workers");
  const { closeRedisConnection } = await import("./queues");
  try {
    await shutdownWorkers();
  } finally {
    await closeRedisConnection();
  }
};
