import { db } from "../db/pool";
import { logAudit } from "../utils/audit";

export type ReturnStatus =
  | "REQUESTED"
  | "SELLER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "RETURN_IN_TRANSIT"
  | "RECEIVED_BY_SELLER"
  | "REFUNDED"
  | "DISPUTED"
  | "ADMIN_REVIEW"
  | "ADMIN_APPROVED"
  | "ADMIN_REJECTED";

export const allowedTransitions: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["SELLER_REVIEW"],
  SELLER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["RETURN_IN_TRANSIT"],
  REJECTED: ["DISPUTED"],
  RETURN_IN_TRANSIT: ["RECEIVED_BY_SELLER"],
  RECEIVED_BY_SELLER: ["REFUNDED"],
  REFUNDED: [],
  DISPUTED: ["ADMIN_APPROVED", "ADMIN_REJECTED", "ADMIN_REVIEW"],
  ADMIN_REVIEW: ["ADMIN_APPROVED", "ADMIN_REJECTED"],
  ADMIN_APPROVED: ["REFUNDED"],
  ADMIN_REJECTED: []
};

export const getReturnRequest = async (returnId: string) => {
  const { rows } = await db.query(
    `SELECT id, order_id, user_id, seller_id, status, seller_decision, video_proof_url
     FROM return_requests
     WHERE id = $1`,
    [returnId]
  );
  return rows[0];
};

export const logReturnStatusChange = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  returnRequestId: string,
  fromStatus: ReturnStatus,
  toStatus: ReturnStatus,
  changedBy?: string | null,
  note?: string | null,
  actorType: "customer" | "shop_owner" | "admin" | "system" = "system"
) => {
  await client.query(
    `INSERT INTO return_status_history
     (return_request_id, from_status, to_status, changed_by, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [returnRequestId, fromStatus, toStatus, changedBy ?? null, note ?? null]
  );

  await logAudit({
    entityType: "return",
    entityId: returnRequestId,
    action: "status_change",
    fromState: fromStatus,
    toState: toStatus,
    actorType,
    actorId: changedBy ?? null,
    metadata: note ? { note } : {},
    client
  });
};
