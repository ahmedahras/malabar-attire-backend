import { deliverAlert } from "./alertDeliveryService";
import { db } from "../db/pool";

const logAlertAction = async (input: {
  alertId: string;
  actionType: string;
  result: string;
}) => {
  await db.query(
    `INSERT INTO alert_actions (alert_id, action_type, result)
     VALUES ($1, $2, $3)`,
    [input.alertId, input.actionType, input.result]
  );
};

const freezePayouts = async (alertId: string) => {
  await db.query(
    `UPDATE system_state
     SET finance_frozen = TRUE,
         payouts_frozen = TRUE,
         freeze_reason = 'finance_mismatch',
         updated_at = NOW()
     WHERE id = 1`,
    []
  );
  await logAlertAction({
    alertId,
    actionType: "freeze_payouts",
    result: "frozen"
  });
};

const retryPayout = async (alertId: string, sellerId?: string) => {
  if (!sellerId) {
    await logAlertAction({
      alertId,
      actionType: "retry_payout",
      result: "missing_seller"
    });
    return;
  }
  await logAlertAction({
    alertId,
    actionType: "retry_payout",
    result: "disabled_manual_payout_mode"
  });
};

const flagSellerRisk = async (alertId: string, sellerId?: string) => {
  if (!sellerId) {
    await logAlertAction({
      alertId,
      actionType: "block_seller_orders",
      result: "missing_seller"
    });
    return;
  }
  await db.query(
    `UPDATE seller_balance
     SET risk_flag = TRUE,
         risk_reason = 'seller_negative_spike',
         risk_set_at = NOW()
     WHERE seller_id = $1`,
    [sellerId]
  );
  await logAlertAction({
    alertId,
    actionType: "seller_risk_flag",
    result: "success"
  });
};

export const createFinanceAlert = async (input: {
  type:
    | "mismatch"
    | "ledger_inconsistency"
    | "high_refunds"
    | "seller_negative_spike"
    | "payout_failure";
  severity?: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, unknown>;
}) => {
  const severity =
    input.severity ??
    (input.type === "mismatch" ||
    input.type === "ledger_inconsistency" ||
    input.type === "payout_failure"
      ? "critical"
      : "medium");

  const { rows } = await db.query(
    `INSERT INTO finance_alerts (type, severity, metadata)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.type, severity, JSON.stringify(input.metadata ?? {})]
  );

  await deliverAlert({
    id: rows[0].id,
    type: input.type,
    severity,
    metadata: input.metadata ?? {}
  });

  if (input.type === "mismatch" || input.type === "ledger_inconsistency") {
    await freezePayouts(rows[0].id);
  }
  if (input.type === "payout_failure") {
    const sellerId = (input.metadata?.sellerId as string) ?? undefined;
    await retryPayout(rows[0].id, sellerId);
  }
  if (input.type === "seller_negative_spike") {
    const sellerId = (input.metadata?.sellerId as string) ?? undefined;
    await flagSellerRisk(rows[0].id, sellerId);
  }
};
