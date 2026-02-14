import { db } from "../db/pool";

export type ActiveCartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  price: number;
};

export type ActiveCartResponse = {
  cartId: string | null;
  items: ActiveCartItem[];
  totalAmount: number;
};

export const getActiveCartForUser = async (userId: string): Promise<ActiveCartResponse> => {
  const cartResult = await db.query<{ id: string }>(
    `SELECT c.id
     FROM carts c
     WHERE c.user_id = $1
       AND c.status = 'active'
     ORDER BY c.created_at DESC
     LIMIT 1`,
    [userId]
  );

  const cartId = cartResult.rows[0]?.id ?? null;
  if (!cartId) {
    return {
      cartId: null,
      items: [],
      totalAmount: 0
    };
  }

  const itemResult = await db.query<{
    product_id: string;
    variant_color_id: string;
    quantity: string | number;
    unit_price_snapshot: string | number;
    total_price_snapshot: string | number;
  }>(
    `SELECT ci.product_id,
            ci.variant_color_id,
            ci.quantity,
            ci.unit_price_snapshot,
            ci.total_price_snapshot
     FROM cart_items ci
     WHERE ci.cart_id = $1`,
    [cartId]
  );

  const items = itemResult.rows.map((row) => ({
    productId: row.product_id,
    variantId: row.variant_color_id,
    quantity: Number(row.quantity ?? 0),
    price: Number(row.unit_price_snapshot ?? 0)
  }));

  const totalAmount = itemResult.rows.reduce(
    (sum, row) => sum + Number(row.total_price_snapshot ?? 0),
    0
  );

  return {
    cartId,
    items,
    totalAmount: Number(totalAmount.toFixed(2))
  };
};
