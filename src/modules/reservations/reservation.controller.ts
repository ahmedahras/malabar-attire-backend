import { Request, Response } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { db } from "../../db/pool";
import { convertReservation } from "./reservation.service";

const reserveSchema = z.object({
  productId: z.string().uuid(),
  variantColorId: z.string().uuid(),
  size: z.string().min(1),
  quantity: z.number().int().positive()
});

const convertSchema = z.object({
  reservationId: z.string().uuid()
});

export const reserveCartItem = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const parsed = reserveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request payload" });
  }
  const body = parsed.data;

  let client: PoolClient | undefined;
  try {
    const productResult = await db.query(
      `SELECT p.id,
              p.name,
              p.price,
              p.district,
              p.images,
              p.status,
              p.is_approved,
              vc.id AS variant_color_id,
              vc.color_name,
              vc.color_image_url,
              vs.size,
              vs.stock
       FROM products p
       INNER JOIN product_variant_colors vc ON vc.id = $2::uuid AND vc.product_id = p.id
       INNER JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id AND vs.size = $3::text
       WHERE p.id = $1::uuid`,
      [body.productId, body.variantColorId, body.size]
    );

    const product = productResult.rows[0];

    if (!product) {
      return res.status(400).json({ error: "Invalid product/variant/size" });
    }
    if (product.status !== "LIVE" || !product.is_approved) {
      return res.status(400).json({ error: "Product unavailable" });
    }

    client = await db.connect();
    await client.query("BEGIN");

    const { rows: cartRows } = await client.query(
      `INSERT INTO carts (user_id, status)
       VALUES ($1::uuid, 'active')
       ON CONFLICT (user_id, status)
       DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [req.user.sub]
    );
    const cartId = cartRows[0].id as string;

    const unitPrice = Number(product.price);
    const productSnapshot = {
      id: product.id,
      name: product.name,
      district: product.district,
      price: unitPrice,
      images: product.images ?? []
    };
    const variantSnapshot = {
      variantColorId: product.variant_color_id,
      colorName: product.color_name,
      colorImageUrl: product.color_image_url ?? null,
      size: product.size,
      stock: product.stock
    };

    const { rows: existing } = await client.query(
      `SELECT id, quantity
       FROM cart_items
       WHERE cart_id = $1::uuid AND variant_color_id = $2::uuid AND size = $3::text
       FOR UPDATE`,
      [cartId, body.variantColorId, body.size]
    );

    let cartItemId: string;
    if (existing[0]) {
      const nextQty = Number(existing[0].quantity) + body.quantity;
      const totalPrice = unitPrice * nextQty;
      await client.query(
        `UPDATE cart_items
         SET quantity = $2,
             unit_price_snapshot = $3,
             total_price_snapshot = $4,
             product_snapshot = $5,
             variant_snapshot = $6,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [
          existing[0].id,
          nextQty,
          unitPrice,
          totalPrice,
          JSON.stringify(productSnapshot),
          JSON.stringify(variantSnapshot)
        ]
      );
      cartItemId = existing[0].id;
    } else {
      const totalPrice = unitPrice * body.quantity;
      const { rows: inserted } = await client.query(
        `INSERT INTO cart_items
         (cart_id, product_id, variant_color_id, size, quantity,
          unit_price_snapshot, total_price_snapshot, product_snapshot, variant_snapshot)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::int, $6::numeric, $7::numeric, $8::jsonb, $9::jsonb)
         RETURNING id`,
        [
          cartId,
          body.productId,
          body.variantColorId,
          body.size,
          body.quantity,
          unitPrice,
          totalPrice,
          JSON.stringify(productSnapshot),
          JSON.stringify(variantSnapshot)
        ]
      );
      cartItemId = inserted[0].id as string;
    }

    await client.query("COMMIT");
    return res.status(200).json({
      reservationId: cartItemId,
      cartId,
      cartItemId,
      expiresAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[CART][reserve] failed", error);
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("[CART][reserve] rollback failed", rollbackError);
      }
    }

    const code = (error as { code?: string }).code;
    if (code === "22P02" || code === "23503" || code === "23505" || code === "23514") {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    return res.status(400).json({ error: "Invalid cart reserve request" });
  } finally {
    client?.release();
  }
};

export const convertReservationHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const body = convertSchema.parse(req.body);

  try {
    await convertReservation(body.reservationId, req.user.sub, req.user.role === "admin");
    return res.json({ success: true, reservationId: body.reservationId });
  } catch (error) {
    if (error instanceof Error && error.message === "Reservation not found") {
      return res.status(404).json({ error: "Reservation not found" });
    }
    if (error instanceof Error && error.message === "Reservation expired") {
      return res.status(409).json({ error: "Reservation expired" });
    }
    if (error instanceof Error && error.message === "Out of stock") {
      return res.status(409).json({ error: "Out of stock" });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return res.status(403).json({ error: "Forbidden" });
    }
    throw error;
  }
};
