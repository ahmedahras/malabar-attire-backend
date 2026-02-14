import { Request, Response } from "express";
import { db } from "../db/pool";
import { env } from "../config/env";
import { JOBS } from "../jobs/types";
import { logAudit } from "../utils/audit";
import { calculateSellerRisk } from "../services/riskEngineService";
import { keysToCamel } from "../utils/case";
import { getCache, setCache } from "../utils/cache";

const buildCacheKey = (base: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${base}:${JSON.stringify(entries)}`;
};

export const financeSummary = async (_req: Request, res: Response) => {
  const cacheKey = "cache:finance:summary";
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const [
    gmvResult,
    commissionResult,
    payablesResult,
    reservesResult,
    refundsResult,
    negativeResult
  ] = await Promise.all([
    db.query(
      `SELECT COALESCE(SUM(order_total), 0)::numeric AS total_gmv
       FROM order_financials`,
      []
    ),
    db.query(
      `SELECT COALESCE(SUM(platform_commission_amount), 0)::numeric AS platform_commission
       FROM order_financials`,
      []
    ),
    db.query(
      `SELECT COALESCE(SUM(pending_amount), 0)::numeric AS seller_payables
       FROM seller_balance`,
      []
    ),
    db.query(
      `SELECT COALESCE(SUM(reserve_amount), 0)::numeric AS seller_reserves
       FROM seller_balance`,
      []
    ),
    db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS refunds_total
       FROM refund_adjustments`,
      []
    ),
    db.query(
      `SELECT COALESCE(SUM(ABS(pending_amount)), 0)::numeric AS negative_balance_total
       FROM seller_balance
       WHERE pending_amount < 0`,
      []
    )
  ]);

  const response = {
    totalGmv: gmvResult.rows[0]?.total_gmv ?? 0,
    platformCommission: commissionResult.rows[0]?.platform_commission ?? 0,
    sellerPayables: payablesResult.rows[0]?.seller_payables ?? 0,
    sellerReserves: reservesResult.rows[0]?.seller_reserves ?? 0,
    refundsTotal: refundsResult.rows[0]?.refunds_total ?? 0,
    negativeBalanceTotal: negativeResult.rows[0]?.negative_balance_total ?? 0
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const sellerFinanceBreakdown = async (req: Request, res: Response) => {
  const sellerId = req.params.sellerId;
  if (!sellerId) {
    return res.status(400).json({ error: "Missing seller id" });
  }
  const cacheKey = `cache:finance:seller:${sellerId}:breakdown`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const [salesResult, commissionResult, refundsResult, reserveResult, payoutResult] =
    await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(of.order_total), 0)::numeric AS lifetime_sales,
                COALESCE(SUM(of.seller_payout_amount), 0)::numeric AS payout_total
         FROM order_financials of
         INNER JOIN orders o ON o.id = of.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(of.platform_commission_amount), 0)::numeric AS commission_paid
         FROM order_financials of
         INNER JOIN orders o ON o.id = of.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS refunds
         FROM refund_adjustments
         WHERE seller_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(reserve_amount, 0)::numeric AS reserve_balance
         FROM seller_balance
         WHERE seller_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS paid_out
         FROM seller_payouts
         WHERE seller_id = $1 AND status = 'COMPLETED'`,
        [sellerId]
      )
    ]);

  const lifetimeSales = Number(salesResult.rows[0]?.lifetime_sales ?? 0);
  const commissionPaid = Number(commissionResult.rows[0]?.commission_paid ?? 0);
  const refunds = Number(refundsResult.rows[0]?.refunds ?? 0);
  const reserveBalance = Number(reserveResult.rows[0]?.reserve_balance ?? 0);
  const paidOut = Number(payoutResult.rows[0]?.paid_out ?? 0);
  const netEarnings = lifetimeSales - commissionPaid - refunds - reserveBalance;

  const response = {
    lifetimeSales,
    commissionPaid,
    refunds,
    reserveBalance,
    paidOut,
    netEarnings
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const payoutHistory = async (req: Request, res: Response) => {
  const sellerId = req.params.sellerId;
  if (!sellerId) {
    return res.status(400).json({ error: "Missing seller id" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `cache:finance:seller:${sellerId}:payouts:${limit}:${offset}`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const [payoutsResult, reserveResult, adjustmentsResult] = await Promise.all([
    db.query(
      `SELECT seller_id, cycle_key, amount, status, created_at
       FROM seller_payouts
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [sellerId, limit, offset]
    ),
    db.query(
      `SELECT COALESCE(reserve_amount, 0)::numeric AS reserve_held
       FROM seller_balance
       WHERE seller_id = $1`,
      [sellerId]
    ),
    db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS adjustments
       FROM refund_adjustments
       WHERE seller_id = $1`,
      [sellerId]
    )
  ]);

  const response = {
    sellerId,
    reserveHeld: reserveResult.rows[0]?.reserve_held ?? 0,
    adjustments: adjustmentsResult.rows[0]?.adjustments ?? 0,
    payouts: payoutsResult.rows.map((row) => ({
      sellerId: row.seller_id,
      payoutCycle: row.cycle_key,
      amountPaid: row.amount,
      status: row.status,
      createdAt: row.created_at
    })),
    limit,
    offset
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const systemState = async (_req: Request, res: Response) => {
  const cacheKey = "cache:finance:system-state";
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const stateResult = await db.query(
    `SELECT finance_frozen, last_reconciliation_at, last_safe_recovery_at,
            mismatch_count_last_run, failed_reconciliation_runs
     FROM system_state
     WHERE id = 1`,
    []
  );

  const blockingAlerts = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM finance_alerts
     WHERE resolved = FALSE
       AND severity = 'critical'`,
    []
  );

  const response = {
    financeFrozen: stateResult.rows[0]?.finance_frozen ?? false,
    lastReconciliationAt: stateResult.rows[0]?.last_reconciliation_at ?? null,
    lastSafeRecoveryAt: stateResult.rows[0]?.last_safe_recovery_at ?? null,
    blockingAlertCount: blockingAlerts.rows[0]?.count ?? 0,
    mismatchCountLastRun: stateResult.rows[0]?.mismatch_count_last_run ?? 0,
    failedReconciliationRuns: stateResult.rows[0]?.failed_reconciliation_runs ?? 0
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const riskySellers = async (_req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(_req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(_req.query.offset ?? 0), 0);
  const cacheKey = `cache:finance:risky-sellers:${limit}:${offset}`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const { rows } = await db.query(
    `SELECT sb.seller_id, sb.pending_amount, sb.reserve_amount, sb.risk_reason, sb.risk_set_at,
            sb.seller_financial_mode,
            sb.last_revalidation_check,
            (SELECT COUNT(*)::int
             FROM finance_alerts fa
             WHERE fa.resolved = FALSE AND fa.metadata->>'sellerId' = sb.seller_id::text) AS unresolved_alert_count
     FROM seller_balance sb
     WHERE sb.risk_flag = TRUE
     ORDER BY sb.risk_set_at DESC NULLS LAST
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const response = {
    items: rows.map((row) => ({
      sellerId: row.seller_id,
      riskReason: row.risk_reason,
      financialMode: row.seller_financial_mode,
      balance: row.pending_amount,
      pendingPayout: Number(row.pending_amount) - Number(row.reserve_amount),
      lastRevalidationCheck: row.last_revalidation_check,
      unresolvedAlertCount: row.unresolved_alert_count
    })),
    limit,
    offset
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const sellerRiskStatus = async (req: Request, res: Response) => {
  const sellerId = req.params.id;
  const cacheKey = `cache:finance:seller:${sellerId}:risk-status`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const [balanceResult, alertsResult, ledgerResult, ordersResult, stateResult] =
    await Promise.all([
      db.query(
        `SELECT risk_flag, risk_reason, risk_set_at, pending_amount, seller_financial_mode
         FROM seller_balance
         WHERE seller_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM finance_alerts
         WHERE resolved = FALSE
           AND metadata->>'sellerId' = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(of.order_total), 0)::numeric AS total
         FROM order_financials of
         INNER JOIN orders o ON o.id = of.order_id
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT COALESCE(SUM(o.total_amount), 0)::numeric AS total
         FROM orders o
         INNER JOIN shops s ON s.id = o.shop_id
         WHERE s.owner_user_id = $1`,
        [sellerId]
      ),
      db.query(
        `SELECT finance_frozen, last_reconciliation_at
         FROM system_state
         WHERE id = 1`,
        []
      )
    ]);

  const orderTotal = Number(ordersResult.rows[0]?.total ?? 0);
  const ledgerTotal = Number(ledgerResult.rows[0]?.total ?? 0);

  const response = {
    sellerId,
    riskFlag: balanceResult.rows[0]?.risk_flag ?? false,
    riskReason: balanceResult.rows[0]?.risk_reason ?? null,
    riskSetAt: balanceResult.rows[0]?.risk_set_at ?? null,
    pendingAmount: balanceResult.rows[0]?.pending_amount ?? 0,
    sellerFinancialMode: balanceResult.rows[0]?.seller_financial_mode ?? "NORMAL",
    alertsPending: alertsResult.rows[0]?.count ?? 0,
    ledgerMatch: Math.abs(orderTotal - ledgerTotal) < 0.01,
    financeFrozen: stateResult.rows[0]?.finance_frozen ?? false,
    lastReconciliationAt: stateResult.rows[0]?.last_reconciliation_at ?? null
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const sellerRiskScore = async (req: Request, res: Response) => {
  const sellerId = String(req.params.sellerId);
  const recalc = req.query.recalculate === "true";

  if (recalc) {
    const result = await calculateSellerRisk(sellerId);
    return res.json({ risk: result });
  }
  const cacheKey = `cache:finance:seller:${sellerId}:risk-score`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const { rows } = await db.query(
    `SELECT seller_id, refund_rate_last_7_days, chargeback_rate_7d, chargeback_rate_30d,
            refund_ratio, rto_rate, order_growth_spike, failed_delivery_rate,
            unsettled_payout_exposure, seller_age_days, delivery_success_rate, complaint_rate,
            payment_fraud_flags, risk_score, risk_level, risk_trend, last_scored_at
     FROM seller_risk_metrics
     WHERE seller_id = $1`,
    [sellerId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Risk score not found" });
  }

  const response = { risk: keysToCamel(rows[0]) };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const sellerIsolationStatus = async (req: Request, res: Response) => {
  const sellerId = String(req.params.sellerId);
  const cacheKey = `cache:finance:seller:${sellerId}:isolation-status`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const { rows } = await db.query(
    `SELECT seller_id, seller_financial_mode, risk_score, risk_below_threshold_since
     FROM seller_balance
     WHERE seller_id = $1`,
    [sellerId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Seller not found" });
  }

  const response = {
    sellerId: rows[0].seller_id,
    sellerFinancialMode: rows[0].seller_financial_mode,
    riskScore: rows[0].risk_score,
    riskBelowThresholdSince: rows[0].risk_below_threshold_since
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const revalidateSellerRiskNow = async (req: Request, res: Response) => {
  const sellerId = String(req.params.id);
  const state = await db.query(
    `SELECT finance_frozen FROM system_state WHERE id = 1`,
    []
  );

  if (state.rows[0]?.finance_frozen && !env.ADMIN_OVERRIDE_FINANCE_FREEZE) {
    await logAudit({
      entityType: "finance",
      entityId: sellerId,
      action: "SELLER_RISK_REVALIDATION_BLOCKED",
      actorType: "admin",
      actorId: req.user?.sub ?? null,
      metadata: { reason: "platform_frozen" }
    });
    return res.status(403).json({ error: "Finance system frozen" });
  }

  if (!env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
    return res.status(503).json({ error: "Jobs are disabled" });
  }

  const { getAutomationQueue } = await import("../jobs/queues");
  await getAutomationQueue().add(
    JOBS.SELLER_RISK_REVALIDATION,
    { sellerId },
    { removeOnComplete: true, removeOnFail: false }
  );

  await logAudit({
    entityType: "seller_balance",
    entityId: sellerId,
    action: "SELLER_RISK_REVALIDATION_REQUESTED",
    actorType: "admin",
    actorId: req.user?.sub ?? null,
    metadata: {}
  });

  return res.json({ queued: true });
};

export const financeSystemHealth = async (_req: Request, res: Response) => {
  const cacheKey = "cache:finance:system-health";
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const [stateResult, alertsResult, riskResult] = await Promise.all([
    db.query(
      `SELECT finance_frozen, last_reconciliation_at, mismatch_count_last_run, failed_reconciliation_runs
       FROM system_state
       WHERE id = 1`,
      []
    ),
    db.query(
      `SELECT COUNT(*)::int AS count
       FROM finance_alerts
       WHERE resolved = FALSE`,
      []
    ),
    db.query(
      `SELECT COUNT(*)::int AS count
       FROM seller_balance
       WHERE risk_flag = TRUE`,
      []
    )
  ]);

  const response = {
    platformFreezeStatus: stateResult.rows[0]?.finance_frozen ?? false,
    totalActiveFinanceAlerts: alertsResult.rows[0]?.count ?? 0,
    sellersUnderRisk: riskResult.rows[0]?.count ?? 0,
    lastReconciliationTime: stateResult.rows[0]?.last_reconciliation_at ?? null,
    mismatchCountLastRun: stateResult.rows[0]?.mismatch_count_last_run ?? 0,
    failedReconciliationRuns: stateResult.rows[0]?.failed_reconciliation_runs ?? 0
  };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const auditEvents = async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const sellerId = req.query.seller_id as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = buildCacheKey("cache:finance:audit-events", {
    type,
    sellerId,
    from,
    to,
    limit,
    offset
  });
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const params: Array<string | number> = [];
  const where: string[] = [];

  if (type) {
    params.push(type);
    where.push(`action = $${params.length}`);
  }

  if (sellerId) {
    params.push(sellerId);
    where.push(
      `(actor_id = $${params.length} OR metadata->>'sellerId' = $${params.length})`
    );
  }

  if (from) {
    params.push(from);
    where.push(`created_at >= $${params.length}`);
  }

  if (to) {
    params.push(to);
    where.push(`created_at <= $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT id, entity_type, entity_id, action, from_state, to_state, actor_type, actor_id,
            metadata, created_at
     FROM audit_logs
     ${clause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const response = { items: rows.map((row) => keysToCamel(row)), limit, offset };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};
