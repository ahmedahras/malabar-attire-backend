import { logger } from "../utils/logger";

export const createPayoutBatchesFromLedger = async () => {
  logger.info("Automatic payout batch creation is disabled in manual payout mode");
  return { disabled: true as const, reason: "manual_payout_mode" };
};

export const markPayoutAsPaid = async (payoutId: string) => {
  logger.info({ payoutId }, "markPayoutAsPaid is deprecated; use admin payout status transition");
  return { updated: false, deprecated: true as const };
};
