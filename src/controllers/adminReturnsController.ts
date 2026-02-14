import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { enqueueRefundJob } from "../jobs/enqueue";
import { allowedTransitions, logReturnStatusChange } from "../services/returnsService";
import { logAudit } from "../utils/audit";

const adminReviewSchema = z.object({
  decision: z.enum(["ADMIN_APPROVED", "ADMIN_REJECTED"]),
  overrideReason: z.string().min(3)
});

const ensureTransitionAllowed = (
  currentStatus: string,
  nextStatus: string
) => {
  const allowed = allowedTransitions[currentStatus as keyof typeof allowedTransitions] ?? [];
  return allowed.includes(nextStatus as (typeof allowed)[number]);
};

export const adminReviewReturn = async (req: Request, res: Response) => {
  const body = adminReviewSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const returnId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, order_id
       FROM return_requests
       WHERE id = $1`,
      [returnId]
    );

    const current = rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Return not found" });
    }

    if (!ensureTransitionAllowed(current.status, body.decision)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid state transition" });
    }

    await client.query(
      `UPDATE return_requests
       SET status = $1,
           decision_source = 'ADMIN',
           override_reason = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [body.decision, body.overrideReason, returnId]
    );

    await logReturnStatusChange(
      client,
      returnId,
      current.status,
      body.decision,
      req.user.sub,
      "Admin review",
      "admin"
    );
    await logAudit({
      entityType: "return",
      entityId: returnId,
      action: "admin_override",
      actorType: "admin",
      actorId: req.user.sub,
      metadata: { decision: body.decision, overrideReason: body.overrideReason }
    });

    await client.query("COMMIT");
    if (body.decision === "ADMIN_APPROVED") {
      await enqueueRefundJob(returnId);
    }
    return res.json({ id: returnId, status: body.decision });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
