import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { keysToCamel } from "../utils/case";

const addressSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(20),
  addressLine1: z.string().trim().min(1).max(255),
  addressLine2: z.string().trim().max(255).optional().default(""),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(4).max(12),
  country: z.string().trim().min(1).max(80).default("India"),
  isDefault: z.boolean().optional().default(false)
});

// GET /api/addresses
export const listAddresses = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Missing token" });

  const { rows } = await db.query(
    `SELECT id, full_name, phone, address_line1, address_line2,
            city, state, pincode, country, is_default, created_at
     FROM customer_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at ASC`,
    [req.user.sub]
  );

  return res.json({ items: rows.map((r) => keysToCamel(r)) });
};

// POST /api/addresses
export const createAddress = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Missing token" });

  const body = addressSchema.parse(req.body);
  const userId = req.user.sub;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // If this address should be default, clear the existing default first
    if (body.isDefault) {
      await client.query(
        `UPDATE customer_addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    const { rows } = await client.query(
      `INSERT INTO customer_addresses
         (user_id, full_name, phone, address_line1, address_line2,
          city, state, pincode, country, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, full_name, phone, address_line1, address_line2,
                 city, state, pincode, country, is_default, created_at`,
      [
        userId,
        body.fullName,
        body.phone,
        body.addressLine1,
        body.addressLine2 ?? "",
        body.city,
        body.state,
        body.pincode,
        body.country,
        body.isDefault
      ]
    );

    await client.query("COMMIT");
    return res.status(201).json(keysToCamel(rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// PUT /api/addresses/:id
export const updateAddress = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Missing token" });

  const addressId = String(req.params.id);
  const body = addressSchema.parse(req.body);
  const userId = req.user.sub;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // Verify ownership
    const owned = await client.query(
      `SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );
    if (!owned.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Address not found" });
    }

    if (body.isDefault) {
      await client.query(
        `UPDATE customer_addresses SET is_default = FALSE WHERE user_id = $1`,
        [userId]
      );
    }

    const { rows } = await client.query(
      `UPDATE customer_addresses
       SET full_name = $1, phone = $2, address_line1 = $3, address_line2 = $4,
           city = $5, state = $6, pincode = $7, country = $8,
           is_default = $9, updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING id, full_name, phone, address_line1, address_line2,
                 city, state, pincode, country, is_default, created_at`,
      [
        body.fullName,
        body.phone,
        body.addressLine1,
        body.addressLine2 ?? "",
        body.city,
        body.state,
        body.pincode,
        body.country,
        body.isDefault,
        addressId,
        userId
      ]
    );

    await client.query("COMMIT");
    return res.json(keysToCamel(rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// DELETE /api/addresses/:id
export const deleteAddress = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Missing token" });

  const addressId = String(req.params.id);
  const userId = req.user.sub;

  const result = await db.query(
    `DELETE FROM customer_addresses WHERE id = $1 AND user_id = $2 RETURNING id`,
    [addressId, userId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: "Address not found" });
  }

  return res.json({ id: addressId, deleted: true });
};

// PATCH /api/addresses/:id/default
export const setDefaultAddress = async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Missing token" });

  const addressId = String(req.params.id);
  const userId = req.user.sub;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const owned = await client.query(
      `SELECT id FROM customer_addresses WHERE id = $1 AND user_id = $2`,
      [addressId, userId]
    );
    if (!owned.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Address not found" });
    }

    // Clear old default then set new one
    await client.query(
      `UPDATE customer_addresses SET is_default = FALSE WHERE user_id = $1`,
      [userId]
    );
    await client.query(
      `UPDATE customer_addresses SET is_default = TRUE, updated_at = NOW() WHERE id = $1`,
      [addressId]
    );

    await client.query("COMMIT");
    return res.json({ id: addressId, isDefault: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};
