import { db } from "../db/pool";
import type { QueryRunner } from "../db/types";

export const blockProductsForSeller = async (sellerId: string, _reason: string) => {
  await db.query(
    `UPDATE products p
     SET is_active = FALSE, updated_at = NOW()
     FROM shops s
     WHERE s.id = p.shop_id
       AND s.owner_user_id = $1`,
    [sellerId]
  );
};

export const markProductsOutOfStockIfNeeded = async (_client: QueryRunner, _productIds: string[]) => {
  // Open marketplace: keep products visible (is_active) independent of stock.
  return;
};
