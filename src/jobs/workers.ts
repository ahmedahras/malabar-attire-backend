import { Worker } from "bullmq";
import { logFailedJob, logJobResult } from "./logger";
import { getDeadLetterQueue, getRedisConnection } from "./queues";
import { JOBS } from "./types";
import {
  autoCancelUnpaidOrders,
  autoCancelOrderIfUnpaid,
  autoCloseDisputedReturns,
  autoExpireReturnWindow,
  processEvent,
  reconcilePayments,
  runSellerPayouts,
  reconcileFinance,
  runSellerRiskMonitor,
  sendFinanceDigest,
  financeSafeRecoveryCheck,
  revalidateSellerRisk,
  scoreSellerRisk,
  monitorSellerIsolation,
  refundReturn,
  releaseExpiredReservations,
  reservationCleanup,
  deliverNotificationJob,
  batchNotifications,
  startReturnWindow,
  sendEmailJob,
  createShipmentJob,
  syncTrackingForActiveShipments,
  processSettlementsJob,
  createPayoutBatchesJob
} from "./handlers";

const createWorker = (queueName: string) => {
  return new Worker(
    queueName,
    async (job) => {
      const startedAt = Date.now();
      try {
        let result: unknown = null;
        switch (job.name) {
          case JOBS.AUTO_CANCEL_UNPAID:
            result = await autoCancelUnpaidOrders();
            break;
          case JOBS.AUTO_CANCEL_ORDER:
            result = await autoCancelOrderIfUnpaid(job.data.orderId);
            break;
          case JOBS.AUTO_EXPIRE_RETURN_WINDOW:
            result = await autoExpireReturnWindow();
            break;
          case JOBS.AUTO_CLOSE_DISPUTED:
            result = await autoCloseDisputedReturns();
            break;
          case JOBS.RELEASE_RESERVATIONS:
            result = await releaseExpiredReservations();
            break;
        case JOBS.RESERVATION_CLEANUP:
          result = await reservationCleanup();
          break;
          case JOBS.START_RETURN_WINDOW:
            result = await startReturnWindow(job.data.orderId);
            break;
          case JOBS.REFUND_RETURN:
            result = await refundReturn(job.data.returnId);
            break;
          case JOBS.PROCESS_EVENT:
            result = await processEvent(job.data.eventId);
            break;
          case JOBS.RECONCILE_PAYMENTS:
            result = await reconcilePayments();
            break;
          case JOBS.RUN_PAYOUTS:
            result = await runSellerPayouts();
            break;
          case JOBS.FINANCE_RECONCILE:
            result = await reconcileFinance();
            break;
          case JOBS.FINANCE_RISK_MONITOR:
            result = await runSellerRiskMonitor();
            break;
          case JOBS.FINANCE_DIGEST:
            result = await sendFinanceDigest();
            break;
          case JOBS.FINANCE_SAFE_RECOVERY_CHECK:
            result = await financeSafeRecoveryCheck();
            break;
          case JOBS.SELLER_RISK_REVALIDATION:
            result = await revalidateSellerRisk(job.data?.sellerId);
            break;
          case JOBS.FINANCE_RISK_SCORING:
            result = await scoreSellerRisk();
            break;
          case JOBS.FINANCE_ISOLATION_MONITOR:
            result = await monitorSellerIsolation();
            break;
          case JOBS.NOTIFY_SELLER_RETURN_REQUESTED:
            result = { notified: true, returnId: job.data.returnId };
            break;
          case JOBS.SEND_EMAIL:
            result = await sendEmailJob(job.data);
            break;
        case JOBS.DELIVER_NOTIFICATION:
          result = await deliverNotificationJob(job.data.deliveryId);
          break;
        case JOBS.BATCH_NOTIFICATIONS:
          result = await batchNotifications();
          break;
        case JOBS.CREATE_SHIPMENT:
          result = await createShipmentJob(job.data.orderId);
          break;
        case JOBS.SYNC_SHIPMENT_TRACKING:
          result = await syncTrackingForActiveShipments();
          break;
        case JOBS.PROCESS_SETTLEMENTS:
          result = await processSettlementsJob();
          break;
        case JOBS.CREATE_PAYOUT_BATCHES:
          result = await createPayoutBatchesJob();
          break;
          default:
            throw new Error("Unknown job");
        }

        await logJobResult({
          queueName,
          jobName: job.name,
          status: "completed",
          attempts: job.attemptsMade,
          durationMs: Date.now() - startedAt,
          payload: job.data
        });

        return result;
      } catch (error) {
        await logJobResult({
          queueName,
          jobName: job.name,
          status: "failed",
          attempts: job.attemptsMade,
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          payload: job.data
        });
        if (job.name === JOBS.DELIVER_NOTIFICATION) {
          const { markDeliveryFailed } = await import(
            "../modules/notifications/notificationDelivery.service"
          );
          const maxAttempts = job.opts.attempts ?? 1;
          if (job.attemptsMade >= maxAttempts) {
            await markDeliveryFailed(
              job.data.deliveryId,
              error instanceof Error ? error.message : "Unknown error"
            );
          }
        }
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade >= maxAttempts) {
          await logFailedJob({
            queueName,
            jobName: job.name,
            attempts: job.attemptsMade,
            errorMessage: error instanceof Error ? error.message : "Unknown error",
            payload: job.data
          });
          await getDeadLetterQueue().add(
            "dead-letter",
            {
              queueName,
              jobName: job.name,
              payload: job.data,
              errorMessage: error instanceof Error ? error.message : "Unknown error"
            },
            { removeOnComplete: true, removeOnFail: false }
          );
        }
        throw error;
      }
    },
    { connection: getRedisConnection() }
  );
};

export const workers = [
  createWorker("automation"),
  createWorker("refunds"),
  createWorker("notifications"),
  createWorker("notification-delivery"),
  createWorker("events")
];

export const shutdownWorkers = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
};
