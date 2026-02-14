import { db } from "../db/pool";
import { markProductsOutOfStockIfNeeded } from "./productLifecycleService";

export const reserveStock = async (variantColorId: string, size: string, quantity: number) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT vs.stock, vc.product_id
       FROM product_variant_sizes vs
       INNER JOIN product_variant_colors vc ON vc.id = vs.variant_color_id
       WHERE vs.variant_color_id = $1 AND vs.size = $2
       FOR UPDATE`,
      [variantColorId, size]
    );

    if (!rows[0] || rows[0].stock < quantity) {
      throw new Error("Insufficient stock");
    }

    await client.query(
      `UPDATE product_variant_sizes
       SET stock = stock - $3
       WHERE variant_color_id = $1 AND size = $2`,
      [variantColorId, size, quantity]
    );

    const productId = rows[0]?.product_id as string | undefined;
    if (productId) {
      await markProductsOutOfStockIfNeeded(client, [productId]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
