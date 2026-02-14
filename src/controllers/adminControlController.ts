import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { logAudit } from "../utils/audit";
import { cacheStats, invalidatePattern } from "../utils/cache";
import { getMetrics } from "../utils/metrics";
import {
  getAutomationQueue,
  getDeadLetterQueue,
  getEventsQueue,
  getNotificationDeliveryQueue,
  getNotificationsQueue,
  getRefundsQueue
} from "../jobs/queues";

const financeFreezeSchema = z.object({
  freeze: z.coerce.boolean(),
  reason: z.string().max(500).optional()
});

const jobsToggleSchema = z.object({
  enabled: z.coerce.boolean()
});

const sellerModeSchema = z.object({
  mode: z.enum(["NORMAL", "MONITORED", "ISOLATED", "BLOCKED"]),
  reason: z.string().max(500).optional()
});

const productBlockSchema = z.object({
  reason: z.string().max(500).optional()
});

const productUnblockSchema = z.object({
  reason: z.string().max(500).optional()
});

const SYSTEM_ENTITY_ID = "00000000-0000-0000-0000-000000000000";

const invalidateAdminCaches = async () => {
  await invalidatePattern("admin:analytics:overview:*");
  await invalidatePattern("admin:alerts:*");
  await invalidatePattern("admin:stats:*");
};

export const toggleFinanceFreeze = async (req: Request, res: Response) => {
  const body = financeFreezeSchema.parse(req.body ?? {});
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE system_state
       SET finance_frozen = $1,
           payouts_frozen = $1,
           freeze_reason = $2,
           updated_at = NOW()
       WHERE id = 1`,
      [body.freeze, body.freeze ? body.reason ?? "admin_action" : null]
    );

    await logAudit({
      entityType: "finance",
      entityId: SYSTEM_ENTITY_ID,
      action: "FINANCE_FREEZE_UPDATED",
      actorType: "admin",
      actorId: req.user?.sub ?? null,
      metadata: { freeze: body.freeze, reason: body.reason ?? null },
      client
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await invalidatePattern("cache:admin:*");
  await invalidateAdminCaches();
  return res.json({ freeze: body.freeze });
};

export const toggleJobsEnabled = async (req: Request, res: Response) => {
  const body = jobsToggleSchema.parse(req.body ?? {});
  process.env.JOBS_ENABLED = body.enabled ? "true" : "false";

  await logAudit({
    entityType: "system",
    entityId: "jobs",
    action: "JOBS_ENABLED_UPDATED",
    actorType: "admin",
    actorId: req.user?.sub ?? null,
    metadata: { enabled: body.enabled }
  });

  await invalidatePattern("cache:admin:*");
  await invalidateAdminCaches();
  return res.json({ enabled: body.enabled });
};

export const updateSellerFinancialMode = async (req: Request, res: Response) => {
  const sellerId = String(req.params.id);
  const body = sellerModeSchema.parse(req.body ?? {});
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE seller_balance
       SET seller_financial_mode = $2,
           updated_at = NOW()
       WHERE seller_id = $1
       RETURNING seller_id, seller_financial_mode`,
      [sellerId, body.mode]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Seller not found" });
    }

    const ordersBlocked = body.mode === "BLOCKED";
    await client.query(
      `UPDATE shops
       SET orders_blocked = $2
       WHERE owner_user_id = $1`,
      [sellerId, ordersBlocked]
    );

    await logAudit({
      entityType: "seller_balance",
      entityId: sellerId,
      action: "SELLER_FINANCIAL_MODE_MANUAL_OVERRIDE",
      actorType: "admin",
      actorId: req.user?.sub ?? null,
      metadata: { mode: body.mode, reason: body.reason ?? null },
      client
    });

    await client.query("COMMIT");
    await invalidatePattern("cache:admin:*");
    await invalidateAdminCaches();
    return res.json({ sellerId, mode: body.mode });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const blockProduct = async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  const body = productBlockSchema.parse(req.body ?? {});
  try {
    const { rows } = await db.query(
      `UPDATE products
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [productId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Product not found" });
    }
    await logAudit({
      entityType: "product",
      entityId: productId,
      action: "product_disabled",
      actorType: "admin",
      actorId: req.user?.sub ?? null,
      metadata: { reason: body.reason ?? null }
    });
    await invalidatePattern("cache:products:*");
    await invalidatePattern("cache:admin:*");
    await invalidateAdminCaches();
    return res.json({ id: productId, isActive: false });
  } catch (error) {
    throw error;
  }
};

export const unblockProduct = async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  const body = productUnblockSchema.parse(req.body ?? {});
  try {
    const { rows } = await db.query(
      `UPDATE products
       SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [productId]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Product not found" });
    }
    await logAudit({
      entityType: "product",
      entityId: productId,
      action: "product_enabled",
      actorType: "admin",
      actorId: req.user?.sub ?? null,
      metadata: { reason: body.reason ?? null }
    });
    await invalidatePattern("cache:products:*");
    await invalidatePattern("cache:admin:*");
    await invalidateAdminCaches();
    return res.json({ id: productId, isActive: true });
  } catch (error) {
    throw error;
  }
};

export const getCacheStats = async (_req: Request, res: Response) => {
  return res.json(cacheStats());
};

export const getQueueMetrics = async (_req: Request, res: Response) => {
  const queues = {
    automation: getAutomationQueue(),
    refunds: getRefundsQueue(),
    notifications: getNotificationsQueue(),
    notificationDelivery: getNotificationDeliveryQueue(),
    events: getEventsQueue()
  };

  const counts = await Promise.all(
    Object.entries(queues).map(async ([key, queue]) => {
      const stats = await queue.getJobCounts("waiting", "active", "delayed", "failed", "paused");
      return [key, stats] as const;
    })
  );

  const queueCounts = Object.fromEntries(counts);
  const queued = Object.values(queueCounts).reduce(
    (sum, stat) => sum + (stat.waiting ?? 0) + (stat.active ?? 0) + (stat.delayed ?? 0),
    0
  );
  const failed = Object.values(queueCounts).reduce((sum, stat) => sum + (stat.failed ?? 0), 0);

  const { rows: retryRows } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM job_logs
     WHERE status = 'failed' AND attempts > 0`
  );
  const retried = Number(retryRows[0]?.count ?? 0);

  const deadLetterStats = await getDeadLetterQueue().getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
    "paused"
  );
  const deadLetter =
    (deadLetterStats.waiting ?? 0) +
    (deadLetterStats.active ?? 0) +
    (deadLetterStats.delayed ?? 0) +
    (deadLetterStats.failed ?? 0) +
    (deadLetterStats.paused ?? 0);

  return res.json({
    queued,
    failed,
    retried,
    deadLetter,
    queues: queueCounts,
    counters: getMetrics()
  });
};
