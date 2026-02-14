import { getAutomationQueue } from "./queues";
import { JOBS } from "./types";
import { env } from "../config/env";

export const registerScheduledJobs = async () => {
  const automationQueue = getAutomationQueue();
  await automationQueue.add(
    JOBS.AUTO_CANCEL_UNPAID,
    {},
    {
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.AUTO_EXPIRE_RETURN_WINDOW,
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.AUTO_CLOSE_DISPUTED,
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.RELEASE_RESERVATIONS,
    {},
    {
      repeat: { every: 10 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.RESERVATION_CLEANUP,
    {},
    {
      repeat: { every: 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.BATCH_NOTIFICATIONS,
    {},
    {
      repeat: { every: 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.RECONCILE_PAYMENTS,
    {},
    {
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_RECONCILE,
    {},
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_RISK_MONITOR,
    {},
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_DIGEST,
    {},
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_SAFE_RECOVERY_CHECK,
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.SELLER_RISK_REVALIDATION,
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_RISK_SCORING,
    {},
    {
      repeat: { every: 6 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.FINANCE_ISOLATION_MONITOR,
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.SYNC_SHIPMENT_TRACKING,
    {},
    {
      repeat: { every: 30 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  await automationQueue.add(
    JOBS.PROCESS_SETTLEMENTS,
    {},
    {
      repeat: { every: 24 * 60 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  // Payout batching is manual-only in Model A. No scheduled payout jobs.
};
