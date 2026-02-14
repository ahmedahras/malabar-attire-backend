import { db } from "../../db/pool";

export const getShopByOwner = async (ownerUserId: string) => {
  const { rows } = await db.query(
    `SELECT id, owner_user_id, name, district, status,
            shiprocket_pickup_name, shiprocket_pickup_address, shiprocket_pickup_configured_at,
            created_at
     FROM shops
     WHERE owner_user_id = $1`,
    [ownerUserId]
  );
  return rows[0] ?? null;
};

export const createShopForOwner = async (input: {
  ownerUserId: string;
  name: string;
  district: string;
}) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM shops WHERE owner_user_id = $1`,
      [input.ownerUserId]
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return { alreadyExists: true, shop: null };
    }

    await client.query(
      `UPDATE users
       SET role = 'shop_owner', updated_at = NOW()
       WHERE id = $1`,
      [input.ownerUserId]
    );

    const { rows } = await client.query(
      `INSERT INTO shops (owner_user_id, name, district, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id, owner_user_id, name, district, status, created_at`,
      [input.ownerUserId, input.name, input.district]
    );

    await client.query("COMMIT");
    return { alreadyExists: false, shop: rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const updateShopPickupAddress = async (input: {
  ownerUserId: string;
  pickupName: string;
  pickupAddress: Record<string, unknown>;
}) => {
  const { rows } = await db.query(
    `UPDATE shops
     SET shiprocket_pickup_name = $2,
         shiprocket_pickup_address = $3::jsonb,
         shiprocket_pickup_configured_at = NOW()
     WHERE owner_user_id = $1
     RETURNING id, owner_user_id, name, district, status,
               shiprocket_pickup_name, shiprocket_pickup_address, shiprocket_pickup_configured_at,
               created_at`,
    [input.ownerUserId, input.pickupName, JSON.stringify(input.pickupAddress)]
  );

  return rows[0] ?? null;
};
