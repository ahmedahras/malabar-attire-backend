import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { enqueueRefundJob, enqueueReturnRequestedNotification } from "../jobs/enqueue";
import { allowedTransitions, logReturnStatusChange } from "../services/returnsService";
import { createNotification } from "../modules/notifications/notification.service";
import { logAudit } from "../utils/audit";

const createReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(["DAMAGED", "WRONG_ITEM"]),
  videoProofUrl: z.string().url().optional(),
  evidence: z
    .array(
      z.object({
        mediaUrl: z.string().url(),
        mediaType: z.enum(["video", "image"])
      })
    )
    .optional()
});

const sellerReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional()
});

const disputeSchema = z.object({
  reason: z.string().min(3)
});

const hasVideoProof = (payload: z.infer<typeof createReturnSchema>) => {
  if (payload.videoProofUrl) {
    return true;
  }
  if (!payload.evidence || payload.evidence.length === 0) {
    return false;
  }
  return payload.evidence.some((item) => item.mediaType === "video");
};

const ensureTransitionAllowed = (
  currentStatus: string,
  nextStatus: string
) => {
  const allowed = allowedTransitions[currentStatus as keyof typeof allowedTransitions] ?? [];
  return allowed.includes(nextStatus as (typeof allowed)[number]);
};

export const createReturnRequest = async (req: Request, res: Response) => {
  const body = createReturnSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  if (!hasVideoProof(body)) {
    return res.status(400).json({ error: "Video proof is required" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT o.id, o.user_id, o.status, s.owner_user_id AS seller_id
       FROM orders o
       INNER JOIN shops s ON s.id = o.shop_id
       WHERE o.id = $1`,
      [body.orderId]
    );

    if (!orderResult.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];
    if (order.user_id !== req.user.sub) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Not your order" });
    }

    if (order.status !== "DELIVERED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Return allowed only for delivered orders" });
    }

    const { rows } = await client.query(
      `INSERT INTO return_requests
       (order_id, user_id, seller_id, reason, status, video_proof_url)
       VALUES ($1, $2, $3, $4, 'REQUESTED', $5)
       RETURNING id, status`,
      [
        body.orderId,
        req.user.sub,
        order.seller_id,
        body.reason,
        body.videoProofUrl ?? null
      ]
    );

    const returnId = rows[0].id as string;

    if (body.evidence && body.evidence.length > 0) {
      for (const item of body.evidence) {
        await client.query(
          `INSERT INTO return_evidence (return_request_id, media_url, media_type)
           VALUES ($1, $2, $3)`,
          [returnId, item.mediaUrl, item.mediaType]
        );
      }
    }

    await logReturnStatusChange(
      client,
      returnId,
      "REQUESTED",
      "REQUESTED",
      req.user.sub,
      "Return requested",
      "customer"
    );

    await client.query("COMMIT");
    await enqueueReturnRequestedNotification(returnId);
    return res.status(201).json({ id: returnId, status: "REQUESTED" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const sellerReviewReturn = async (req: Request, res: Response) => {
  const body = sellerReviewSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const returnId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, seller_id
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
           seller_decision = $2,
           seller_notes = $3,
           seller_reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [body.decision, body.decision, body.notes ?? null, returnId]
    );

    await logReturnStatusChange(
      client,
      returnId,
      current.status,
      body.decision,
      req.user.sub,
      "Seller review",
      "shop_owner"
    );

    await client.query("COMMIT");
    return res.json({ id: returnId, status: body.decision });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const markReturnReceived = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const returnId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, seller_id
       FROM return_requests
       WHERE id = $1`,
      [returnId]
    );

    const current = rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Return not found" });
    }

    if (!ensureTransitionAllowed(current.status, "RECEIVED_BY_SELLER")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid state transition" });
    }

    await client.query(
      `UPDATE return_requests
       SET status = 'RECEIVED_BY_SELLER',
           updated_at = NOW()
       WHERE id = $1`,
      [returnId]
    );

    await logReturnStatusChange(
      client,
      returnId,
      current.status,
      "RECEIVED_BY_SELLER",
      req.user.sub,
      "Return received",
      "shop_owner"
    );

    await client.query("COMMIT");
    return res.json({ id: returnId, status: "RECEIVED_BY_SELLER" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const refundReturn = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const returnId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, seller_decision, seller_id, order_id, user_id
       FROM return_requests
       WHERE id = $1`,
      [returnId]
    );

    const current = rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Return not found" });
    }

    if (current.status !== "RECEIVED_BY_SELLER") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Return not received by seller" });
    }

    if (current.seller_decision !== "APPROVED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Seller approval required" });
    }

    if (!ensureTransitionAllowed(current.status, "REFUNDED")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid state transition" });
    }

    await client.query("COMMIT");
    await logAudit({
      entityType: "return",
      entityId: returnId,
      action: "refund_approved",
      actorType: "admin",
      actorId: req.user.sub,
      metadata: { orderId: current.order_id }
    });
    await enqueueRefundJob(returnId);
    await createNotification({
      userId: current.user_id,
      type: "refund_initiated",
      title: "Refund initiated",
      message: `Refund initiated for return ${returnId}.`,
      metadata: { returnId, orderId: current.order_id }
    });
    return res.json({ id: returnId, status: "REFUND_QUEUED" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const disputeReturn = async (req: Request, res: Response) => {
  const body = disputeSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const returnId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, status, user_id
       FROM return_requests
       WHERE id = $1`,
      [returnId]
    );

    const current = rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Return not found" });
    }

    if (current.status !== "REJECTED") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Dispute allowed only after rejection" });
    }

    if (!ensureTransitionAllowed(current.status, "DISPUTED")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Invalid state transition" });
    }

    await client.query(
      `UPDATE return_requests
       SET status = 'DISPUTED',
           updated_at = NOW()
       WHERE id = $1`,
      [returnId]
    );

    await logReturnStatusChange(
      client,
      returnId,
      current.status,
      "DISPUTED",
      req.user.sub,
      body.reason,
      "customer"
    );

    await client.query("COMMIT");
    return res.json({ id: returnId, status: "DISPUTED" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
