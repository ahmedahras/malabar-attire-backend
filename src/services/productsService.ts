import { db } from "../db/pool";
import { logAudit } from "../utils/audit";

export const approveProduct = async (productId: string, adminUserId: string) => {
  const { rows } = await db.query(
    `UPDATE products
     SET status = 'LIVE',
         is_approved = TRUE,
         approved_at = NOW(),
         approved_by = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status`,
    [productId, adminUserId]
  );

  if (!rows[0]) {
    return null;
  }

  await logAudit({
    entityType: "product",
    entityId: productId,
    action: "product_approved",
    fromState: null,
    toState: rows[0].status,
    actorType: "admin",
    actorId: adminUserId,
    metadata: {}
  });

  return rows[0];
};
