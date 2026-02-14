import { Request, Response } from "express";
import { db } from "../db/pool";
import { keysToCamel } from "../utils/case";
import { env } from "../config/env";
import { logAudit } from "../utils/audit";

export const listAlerts = async (req: Request, res: Response) => {
  const severity = req.query.severity as string | undefined;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const params: Array<string> = [];
  const where: string[] = [];

  if (severity) {
    params.push(severity);
    where.push(`severity = $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(String(limit));
  params.push(String(offset));

  const { rows } = await db.query(
    `SELECT id, type, severity, resolved, metadata, created_at
     FROM finance_alerts
     ${clause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({ items: rows.map((row) => keysToCamel(row)), limit, offset });
};

export const resolveAlert = async (req: Request, res: Response) => {
  const alertId = String(req.params.id ?? "");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE finance_alerts
       SET resolved = TRUE
       WHERE id = $1
       RETURNING *`,
      [alertId]
    );

    if (!rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Alert not found" });
    }

    const alert = rows[0];
    if (alert.type === "mismatch" && env.ADMIN_OVERRIDE_FINANCE_FREEZE) {
      await client.query(
        `UPDATE system_state
         SET finance_frozen = FALSE,
             payouts_frozen = FALSE,
             freeze_reason = NULL,
             updated_at = NOW()
         WHERE id = 1`,
        []
      );
      await client.query(
        `INSERT INTO alert_actions (alert_id, action_type, result)
         VALUES ($1, 'unfreeze_payouts', 'admin_override')`,
        [alertId]
      );
      if (req.user) {
        await logAudit({
          entityType: "finance",
          entityId: alertId,
          action: "admin_override",
          actorType: req.user.role,
          actorId: req.user.sub,
          metadata: { alertType: alert.type }
        });
      }
    }

    if (alert.type === "seller_negative_spike") {
      const sellerId = String(
        req.params.sellerId ||
          req.body?.sellerId ||
          req.query?.sellerId ||
          alert.metadata?.sellerId ||
          ""
      );
      if (sellerId) {
        await client.query(
          `UPDATE shops
           SET orders_blocked = FALSE
           WHERE owner_user_id = $1`,
          [sellerId]
        );
        await client.query(
          `INSERT INTO alert_actions (alert_id, action_type, result)
           VALUES ($1, 'unblock_seller_orders', 'unblocked')`,
          [alertId]
        );
        if (req.user) {
          await logAudit({
            entityType: "shop",
            entityId: sellerId,
            action: "admin_override",
            actorType: req.user.role,
            actorId: req.user.sub,
            metadata: { alertType: alert.type }
          });
        }
      }
    }

    await client.query("COMMIT");
    return res.json({ alert: keysToCamel(alert) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
