"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectSellerApplication = exports.approveSellerApplication = exports.listSellerApplicationsAdmin = exports.applySeller = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const cache_1 = require("../utils/cache");
const applySchema = zod_1.z.object({
    shopName: zod_1.z.string().min(2),
    phone: zod_1.z.string().min(6),
    address: zod_1.z.string().min(6),
    idProofUrl: zod_1.z.string().url().optional(),
    bankAccountName: zod_1.z.string().optional(),
    bankAccountNumber: zod_1.z.string().optional(),
    ifscCode: zod_1.z.string().optional(),
    categoryType: zod_1.z.string().optional()
});
const applySeller = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = applySchema.parse(req.body ?? {});
    const userId = req.user.sub;
    const userResult = await pool_1.db.query(`SELECT roles FROM users WHERE id = $1`, [userId]);
    const roles = Array.isArray(userResult.rows[0]?.roles) ? userResult.rows[0].roles : [];
    if (roles.includes("shop_owner")) {
        return res.status(400).json({ error: "User is already a seller" });
    }
    const existing = await pool_1.db.query(`SELECT id FROM seller_applications WHERE user_id = $1 AND status = 'pending'`, [userId]);
    if (existing.rows[0]) {
        return res.status(409).json({ error: "Application already pending" });
    }
    const { rows } = await pool_1.db.query(`INSERT INTO seller_applications
     (user_id, shop_name, phone, address, id_proof_url, bank_account_name, bank_account_number, ifsc_code, category_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
     RETURNING id`, [
        userId,
        body.shopName,
        body.phone,
        body.address,
        body.idProofUrl ?? null,
        body.bankAccountName ?? null,
        body.bankAccountNumber ?? null,
        body.ifscCode ?? null,
        body.categoryType ?? null
    ]);
    await (0, cache_1.invalidatePattern)("admin:seller_applications:*");
    return res.status(201).json({ id: rows[0]?.id });
};
exports.applySeller = applySeller;
const listSellerApplicationsAdmin = async (_req, res) => {
    const { rows } = await pool_1.db.query(`SELECT
       sa.id,
       sa.user_id,
       sa.shop_name,
       sa.phone,
       sa.address,
       sa.id_proof_url,
       sa.bank_account_name,
       sa.bank_account_number,
       sa.ifsc_code,
       sa.category_type,
       sa.status,
       sa.created_at,
       u.full_name AS user_name,
       u.email AS user_email
     FROM seller_applications sa
     INNER JOIN users u ON u.id = sa.user_id
     ORDER BY sa.created_at DESC`);
    return res.json({ items: rows });
};
exports.listSellerApplicationsAdmin = listSellerApplicationsAdmin;
const approveSellerApplication = async (req, res) => {
    const id = String(req.params.id);
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const appResult = await client.query(`UPDATE seller_applications
       SET status = 'approved'
       WHERE id = $1
       RETURNING id, user_id, shop_name, address`, [id]);
        const app = appResult.rows[0];
        if (!app) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Application not found" });
        }
        await client.query(`UPDATE users
       SET roles = CASE
         WHEN roles @> ARRAY['shop_owner']::text[] THEN roles
         ELSE array_append(roles, 'shop_owner')
       END,
       role = 'shop_owner'
       WHERE id = $1`, [app.user_id]);
        await client.query(`INSERT INTO shops (owner_user_id, name, district, address)
       SELECT $1, $2, 'Unknown', $3
       WHERE NOT EXISTS (SELECT 1 FROM shops WHERE owner_user_id = $1)`, [app.user_id, app.shop_name, app.address]);
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK");
        throw e;
    }
    finally {
        client.release();
    }
    await (0, cache_1.invalidatePattern)("admin:seller_applications:*");
    return res.json({ id });
};
exports.approveSellerApplication = approveSellerApplication;
const rejectSellerApplication = async (req, res) => {
    const id = String(req.params.id);
    const { rows } = await pool_1.db.query(`UPDATE seller_applications
     SET status = 'rejected'
     WHERE id = $1
     RETURNING id`, [id]);
    if (!rows[0]) {
        return res.status(404).json({ error: "Application not found" });
    }
    await (0, cache_1.invalidatePattern)("admin:seller_applications:*");
    return res.json({ id });
};
exports.rejectSellerApplication = rejectSellerApplication;
//# sourceMappingURL=sellerApplicationsController.js.map