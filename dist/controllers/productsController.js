"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAdminProducts = exports.adminDeleteProduct = exports.getSimilarProducts = exports.getProductVariants = exports.listProductCategories = exports.getProductById = exports.listProducts = exports.updateSellerProduct = exports.listSellerProducts = exports.createProduct = void 0;
const zod_1 = require("zod");
const pool_1 = require("../db/pool");
const case_1 = require("../utils/case");
const audit_1 = require("../utils/audit");
const env_1 = require("../config/env");
const cache_1 = require("../utils/cache");
const parseCategoryIds = (value) => {
    if (!value)
        return undefined;
    if (Array.isArray(value))
        return value;
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return undefined;
};
const parseCategoryTypes = (value) => {
    if (!value)
        return undefined;
    if (Array.isArray(value))
        return value;
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return undefined;
};
const createProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    fabric: zod_1.z.string().optional(),
    fit: zod_1.z.string().optional(),
    occasion: zod_1.z.string().optional(),
    careInstructions: zod_1.z.string().optional(),
    categoryIds: zod_1.z.array(zod_1.z.string().uuid()).min(1),
    district: zod_1.z.string().min(2),
    price: zod_1.z.number().positive(),
    sizeChart: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    images: zod_1.z.array(zod_1.z.string().url()).default([]),
    colors: zod_1.z
        .array(zod_1.z.object({
        colorName: zod_1.z.string().min(1),
        colorImageUrl: zod_1.z.string().url().optional(),
        sizes: zod_1.z
            .array(zod_1.z.object({
            size: zod_1.z.string().min(1),
            stock: zod_1.z.number().int().nonnegative().default(0)
        }))
            .min(1)
    }))
        .min(1)
});
const listProductsSchema = zod_1.z.object({
    category: zod_1.z.string().optional(),
    gender: zod_1.z.string().optional(),
    categoryIds: zod_1.z.preprocess(parseCategoryIds, zod_1.z.array(zod_1.z.string().uuid()).min(1).optional()),
    size: zod_1.z.string().optional(),
    district: zod_1.z.string().optional(),
    minPrice: zod_1.z.coerce.number().optional(),
    maxPrice: zod_1.z.coerce.number().optional(),
    inStock: zod_1.z.coerce.boolean().optional(),
    limit: zod_1.z.coerce.number().int().positive().max(50).default(10),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    page: zod_1.z.coerce.number().int().positive().optional(),
    sort: zod_1.z.string().optional()
});
const adminListSchema = zod_1.z.object({
    isActive: zod_1.z
        .union([zod_1.z.literal("true"), zod_1.z.literal("false")])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true"))
});
const updateProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).optional(),
    description: zod_1.z.string().optional(),
    fabric: zod_1.z.string().optional(),
    fit: zod_1.z.string().optional(),
    occasion: zod_1.z.string().optional(),
    careInstructions: zod_1.z.string().optional(),
    categoryIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).optional(),
    district: zod_1.z.string().min(2).optional(),
    price: zod_1.z.number().positive().optional(),
    sizeChart: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    images: zod_1.z.array(zod_1.z.string().url()).optional(),
    colors: zod_1.z
        .array(zod_1.z.object({
        colorName: zod_1.z.string().min(1),
        colorImageUrl: zod_1.z.string().url().optional(),
        sizes: zod_1.z
            .array(zod_1.z.object({
            size: zod_1.z.string().min(1),
            stock: zod_1.z.number().int().nonnegative().default(0)
        }))
            .min(1)
    }))
        .optional()
});
const normalizeImageName = (value) => {
    const stripped = value.split("?")[0] ?? value;
    const parts = stripped.split("/");
    return parts[parts.length - 1] || stripped;
};
const withCdn = (value) => {
    const name = normalizeImageName(value);
    if (!env_1.env.CDN_BASE_URL) {
        return name;
    }
    return `${env_1.env.CDN_BASE_URL.replace(/\/$/, "")}/products/${name}`;
};
const buildCacheKey = (base, query) => {
    const entries = Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
    return `${base}:${JSON.stringify(entries)}`;
};
const buildFilters = (query) => {
    const where = [];
    const params = [];
    where.push(`p.is_active = TRUE`);
    if (query.categoryIds?.length) {
        params.push(query.categoryIds);
        where.push(`EXISTS (
        SELECT 1 FROM product_category_map pcm
        WHERE pcm.product_id = p.id
          AND pcm.category_id = ANY($${params.length}::uuid[])
      )`);
    }
    if (query.gender?.trim()) {
        params.push(query.gender.trim().toUpperCase());
        where.push(`EXISTS (
        SELECT 1
        FROM product_category_map pcm
        INNER JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE pcm.product_id = p.id
          AND pc.gender = $${params.length}
      )`);
    }
    if (query.category?.trim()) {
        params.push(`%${query.category.trim()}%`);
        where.push(`EXISTS (
        SELECT 1
        FROM product_category_map pcm
        INNER JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE pcm.product_id = p.id
          AND pc.name ILIKE $${params.length}
      )`);
    }
    if (query.district) {
        params.push(query.district);
        where.push(`p.district = $${params.length}`);
    }
    if (query.minPrice !== undefined) {
        params.push(query.minPrice);
        where.push(`p.price >= $${params.length}`);
    }
    if (query.maxPrice !== undefined) {
        params.push(query.maxPrice);
        where.push(`p.price <= $${params.length}`);
    }
    if (query.size) {
        params.push(query.size);
        where.push(`EXISTS (
        SELECT 1
        FROM product_variant_colors vc
        INNER JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id
        WHERE vc.product_id = p.id
          AND vs.size = $${params.length}
      )`);
    }
    if (query.inStock) {
        where.push(`COALESCE(s.total_stock, 0) > 0`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return { clause, params };
};
const createProduct = async (req, res) => {
    const body = createProductSchema.parse(req.body);
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const totalStock = body.colors.reduce((sum, color) => sum + color.sizes.reduce((acc, s) => acc + Number(s.stock ?? 0), 0), 0);
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const shopResult = await client.query(`SELECT id FROM shops WHERE owner_user_id = $1`, [req.user.sub]);
        const shopId = shopResult.rows[0]?.id;
        if (!shopId) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Shop not found" });
        }
        const sellerRisk = await client.query(`SELECT sb.risk_flag
       FROM shops s
       INNER JOIN seller_balance sb ON sb.seller_id = s.owner_user_id
       WHERE s.id = $1`, [shopId]);
        if (sellerRisk.rows[0]?.risk_flag) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: "Seller is under financial review" });
        }
        const { ensurePublishingAllowedForSeller } = await Promise.resolve().then(() => __importStar(require("../services/sellerModeEnforcer")));
        const decision = await ensurePublishingAllowedForSeller(req.user.sub);
        if (!decision.allowed) {
            await client.query("ROLLBACK");
            return res.status(403).json({ error: decision.reason });
        }
        const categoryIds = body.categoryIds;
        const categoryResult = await client.query(`SELECT id, name, gender, parent_id
       FROM product_categories
       WHERE id = ANY($1::uuid[])`, [categoryIds]);
        if (categoryResult.rows.length !== categoryIds.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Invalid categories" });
        }
        const hasKidsRoot = categoryResult.rows.some((c) => c.gender === "KIDS" && c.parent_id === null);
        if (hasKidsRoot) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                error: "For KIDS products, you must select an age group category (child category), not just Kids Boy/Girl."
            });
        }
        const categoriesById = new Map(categoryResult.rows.map((row) => [row.id, row.name]));
        const primaryCategoryName = categoriesById.get(categoryIds[0]) ?? categoryResult.rows[0]?.name ?? "Uncategorized";
        const { rows } = await client.query(`INSERT INTO products
       (shop_id, name, description, fabric, fit, occasion, care_instructions,
        category, district, price, quantity, size_chart, images, is_active, status, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, 'LIVE', TRUE)
       RETURNING id`, [
            shopId,
            body.name,
            body.description ?? null,
            body.fabric ?? null,
            body.fit ?? null,
            body.occasion ?? null,
            body.careInstructions ?? null,
            primaryCategoryName,
            body.district,
            body.price,
            totalStock,
            body.sizeChart ?? null,
            JSON.stringify(body.images.map(normalizeImageName))
        ]);
        const productId = rows[0].id;
        await client.query(`UPDATE products
       SET slug = COALESCE(slug, id::text)
       WHERE id = $1`, [productId]);
        await client.query(`INSERT INTO product_category_map (product_id, category_id)
       SELECT $1, unnest($2::uuid[])`, [productId, categoryIds]);
        for (const color of body.colors) {
            const colorResult = await client.query(`INSERT INTO product_variant_colors (product_id, color_name, color_image_url)
         VALUES ($1, $2, $3)
         RETURNING id`, [productId, color.colorName.trim(), color.colorImageUrl ? normalizeImageName(color.colorImageUrl) : null]);
            const variantColorId = colorResult.rows[0]?.id;
            for (const sizeRow of color.sizes) {
                await client.query(`INSERT INTO product_variant_sizes (variant_color_id, size, stock)
           VALUES ($1, $2, $3)`, [variantColorId, sizeRow.size.trim(), Number(sizeRow.stock ?? 0)]);
            }
        }
        await (0, audit_1.logAudit)({
            entityType: "product",
            entityId: productId,
            action: "product_created",
            fromState: null,
            toState: "LIVE",
            actorType: "shop_owner",
            actorId: req.user.sub,
            metadata: { shopId },
            client
        });
        await client.query("COMMIT");
        await (0, cache_1.invalidatePattern)("cache:products:*");
        return res.status(201).json({ id: productId });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.createProduct = createProduct;
const listSellerProducts = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopResult = await pool_1.db.query(`SELECT id FROM shops WHERE owner_user_id = $1`, [req.user.sub]);
    const shopId = shopResult.rows[0]?.id;
    if (!shopId) {
        return res.status(400).json({ error: "Shop not found" });
    }
    const { rows } = await pool_1.db.query(`SELECT
      p.id,
      p.slug,
      p.name,
      p.category,
      p.price,
      p.quantity,
      p.images->>0 AS main_image,
      COALESCE(s.total_stock, 0) AS total_stock,
      p.is_active
     FROM products p
     LEFT JOIN product_stock_summary s ON s.product_id = p.id
     WHERE p.shop_id = $1
     ORDER BY p.created_at DESC`, [shopId]);
    const items = rows.map((row) => {
        const mapped = (0, case_1.keysToCamel)(row);
        if (mapped.mainImage) {
            mapped.mainImage = withCdn(mapped.mainImage);
        }
        return mapped;
    });
    return res.json({ items });
};
exports.listSellerProducts = listSellerProducts;
const updateSellerProduct = async (req, res) => {
    const body = updateProductSchema.parse(req.body ?? {});
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const productId = String(req.params.id);
    const client = await pool_1.db.connect();
    try {
        await client.query("BEGIN");
        const shopResult = await client.query(`SELECT id FROM shops WHERE owner_user_id = $1`, [req.user.sub]);
        const shopId = shopResult.rows[0]?.id;
        if (!shopId) {
            await client.query("ROLLBACK");
            return res.status(400).json({ error: "Shop not found" });
        }
        const ownerCheck = await client.query(`SELECT id FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [productId, shopId]);
        if (!ownerCheck.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "Product not found" });
        }
        const updates = [];
        const params = [];
        const push = (field, value) => {
            params.push(value);
            updates.push(`${field} = $${params.length}`);
        };
        if (body.name !== undefined)
            push("name", body.name);
        if (body.description !== undefined)
            push("description", body.description ?? null);
        if (body.fabric !== undefined)
            push("fabric", body.fabric ?? null);
        if (body.fit !== undefined)
            push("fit", body.fit ?? null);
        if (body.occasion !== undefined)
            push("occasion", body.occasion ?? null);
        if (body.careInstructions !== undefined)
            push("care_instructions", body.careInstructions ?? null);
        if (body.categoryIds !== undefined) {
            const categoryResult = await client.query(`SELECT id, name, gender, parent_id
         FROM product_categories
         WHERE id = ANY($1::uuid[])`, [body.categoryIds]);
            if (categoryResult.rows.length !== body.categoryIds.length) {
                await client.query("ROLLBACK");
                return res.status(400).json({ error: "Invalid categories" });
            }
            const hasKidsRoot = categoryResult.rows.some((c) => c.gender === "KIDS" && c.parent_id === null);
            if (hasKidsRoot) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    error: "For KIDS products, you must select an age group category (child category), not just Kids Boy/Girl."
                });
            }
            const categoriesById = new Map(categoryResult.rows.map((row) => [row.id, row.name]));
            const primaryCategoryName = categoriesById.get(body.categoryIds[0]) ??
                categoryResult.rows[0]?.name ??
                "Uncategorized";
            push("category", primaryCategoryName);
        }
        if (body.district !== undefined)
            push("district", body.district);
        if (body.price !== undefined)
            push("price", body.price);
        if (body.sizeChart !== undefined)
            push("size_chart", body.sizeChart ?? null);
        if (body.images !== undefined) {
            push("images", JSON.stringify(body.images.map(normalizeImageName)));
        }
        if (updates.length) {
            params.push(productId);
            await client.query(`UPDATE products
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${params.length}`, params);
        }
        if (body.categoryIds !== undefined) {
            await client.query(`DELETE FROM product_category_map WHERE product_id = $1`, [productId]);
            await client.query(`INSERT INTO product_category_map (product_id, category_id)
         SELECT $1, unnest($2::uuid[])`, [productId, body.categoryIds]);
        }
        if (body.colors) {
            const nextTotalStock = body.colors.reduce((sum, color) => sum + color.sizes.reduce((acc, s) => acc + Number(s.stock ?? 0), 0), 0);
            await client.query(`UPDATE products SET quantity = $2, updated_at = NOW() WHERE id = $1`, [
                productId,
                nextTotalStock
            ]);
            await client.query(`DELETE FROM product_variant_colors WHERE product_id = $1`, [productId]);
            for (const color of body.colors) {
                const colorResult = await client.query(`INSERT INTO product_variant_colors (product_id, color_name, color_image_url)
           VALUES ($1, $2, $3)
           RETURNING id`, [
                    productId,
                    color.colorName.trim(),
                    color.colorImageUrl ? normalizeImageName(color.colorImageUrl) : null
                ]);
                const variantColorId = colorResult.rows[0]?.id;
                for (const sizeRow of color.sizes) {
                    await client.query(`INSERT INTO product_variant_sizes (variant_color_id, size, stock)
             VALUES ($1, $2, $3)`, [variantColorId, sizeRow.size.trim(), Number(sizeRow.stock ?? 0)]);
                }
            }
        }
        await client.query("COMMIT");
        await (0, cache_1.invalidatePattern)("cache:products:*");
        return res.json({ id: productId });
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
};
exports.updateSellerProduct = updateSellerProduct;
const listProducts = async (req, res) => {
    const query = listProductsSchema.parse(req.query);
    const offset = req.query.page && !req.query.offset
        ? (Number(query.page ?? 1) - 1) * query.limit
        : query.offset;
    const cacheKey = buildCacheKey("cache:products", {
        ...req.query,
        limit: query.limit,
        offset
    });
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const { clause, params } = buildFilters(query);
    const orderBy = query.sort === "priority_desc" || !query.sort
        ? "ORDER BY p.priority_score DESC"
        : "ORDER BY p.created_at DESC";
    const itemsQuery = `
    SELECT
      p.id,
      p.slug,
      p.name,
      p.price,
      p.quantity,
      p.district,
      p.images->>0 AS main_image,
      (COALESCE(s.total_stock, 0) > 0) AS in_stock,
      p.is_active
    FROM products p
    LEFT JOIN product_stock_summary s ON s.product_id = p.id
    ${clause}
    ${orderBy}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
    const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM products p
    LEFT JOIN product_stock_summary s ON s.product_id = p.id
    ${clause}
  `;
    const [itemsResult, countResult] = await Promise.all([
        pool_1.db.query(itemsQuery, [...params, query.limit, offset]),
        pool_1.db.query(countQuery, params)
    ]);
    const items = itemsResult.rows.map((row) => {
        const mapped = (0, case_1.keysToCamel)(row);
        if (mapped.mainImage) {
            mapped.mainImage = withCdn(mapped.mainImage);
        }
        return mapped;
    });
    const response = {
        items,
        limit: query.limit,
        offset,
        total: countResult.rows[0]?.total ?? 0
    };
    await (0, cache_1.setCache)(cacheKey, response, 60);
    return res.json(response);
};
exports.listProducts = listProducts;
const getProductById = async (req, res) => {
    const productId = String(req.params.id);
    const productResult = await pool_1.db.query(`SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.fabric,
      p.fit,
      p.occasion,
      p.care_instructions,
      p.category,
      p.district,
      p.price,
      p.images,
      p.size_chart,
      p.priority_score,
      p.rating_avg,
      p.rating_count,
      p.is_active,
      p.created_at,
      p.quantity,
      COALESCE(s.total_stock, 0) AS total_stock,
      sh.id AS shop_id,
      sh.name AS shop_name,
      sh.district AS shop_district,
      sh.logo_url AS shop_logo_url,
      sh.is_approved AS shop_is_approved,
      sh.owner_user_id AS shop_owner_id
     FROM products p
     LEFT JOIN product_stock_summary s ON s.product_id = p.id
     INNER JOIN shops sh ON sh.id = p.shop_id
     WHERE p.id = $1`, [productId]);
    if (!productResult.rows[0]) {
        return res.status(404).json({ error: "Product not found" });
    }
    const isActive = productResult.rows[0].is_active;
    if (!isActive) {
        const actor = req.user;
        const ownerId = productResult.rows[0].shop_owner_id;
        if (!actor || (actor.role !== "admin" && actor.sub !== ownerId)) {
            return res.status(404).json({ error: "Product not found" });
        }
    }
    const [colorsResult, categoriesResult] = await Promise.all([
        pool_1.db.query(`SELECT
         vc.id,
         vc.color_name,
         vc.color_image_url,
         vs.size,
         vs.stock
       FROM product_variant_colors vc
       LEFT JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id
       WHERE vc.product_id = $1
       ORDER BY vc.color_name ASC, vs.size ASC`, [productId]),
        pool_1.db.query(`SELECT pc.id, pc.name, pc.slug
       FROM product_categories pc
       INNER JOIN product_category_map pcm ON pcm.category_id = pc.id
       WHERE pcm.product_id = $1
       ORDER BY pc.name`, [productId])
    ]);
    const colorsById = new Map();
    for (const row of colorsResult.rows) {
        const id = String(row.id);
        const existing = colorsById.get(id) ??
            (() => {
                const next = {
                    id,
                    colorName: String(row.color_name ?? ""),
                    colorImage: row.color_image_url ? withCdn(String(row.color_image_url)) : null,
                    sizes: []
                };
                colorsById.set(id, next);
                return next;
            })();
        if (row.size) {
            existing.sizes.push({ size: String(row.size), stock: Number(row.stock ?? 0) });
        }
    }
    const colors = Array.from(colorsById.values());
    const categories = categoriesResult.rows.map((row) => (0, case_1.keysToCamel)(row));
    const row = (0, case_1.keysToCamel)(productResult.rows[0]);
    const response = {
        product: {
            id: row.id,
            slug: row.slug,
            name: row.name,
            description: row.description,
            fabric: row.fabric,
            fit: row.fit,
            occasion: row.occasion,
            careInstructions: row.careInstructions,
            category: row.category,
            district: row.district,
            price: row.price,
            isActive: row.isActive,
            priorityScore: row.priorityScore,
            ratingAvg: row.ratingAvg,
            ratingCount: row.ratingCount,
            createdAt: row.createdAt,
            quantity: row.quantity,
            totalStock: row.totalStock,
            categories
        },
        media: {
            images: (row.images ?? []).map((image) => withCdn(String(image))),
            sizeChart: row.sizeChart ?? null
        },
        colors,
        shop: {
            id: row.shopId,
            name: row.shopName,
            district: row.shopDistrict,
            logoUrl: row.shopLogoUrl,
            isApproved: row.shopIsApproved
        }
    };
    return res.json(response);
};
exports.getProductById = getProductById;
const listProductCategories = async (req, res) => {
    const types = parseCategoryTypes(req.query.type);
    const gender = typeof req.query.gender === "string" ? req.query.gender : undefined;
    const where = [];
    const params = [];
    if (types?.length) {
        params.push(...types);
        const placeholders = types.map((_, idx) => `$${idx + 1}`).join(", ");
        where.push(`type IN (${placeholders})`);
    }
    if (gender) {
        params.push(gender);
        where.push(`(gender = $${params.length} OR gender IS NULL)`);
    }
    // Global enforcement:
    // - Never expose style-based categories under gender=KIDS
    // - For KIDS non-root categories, enforce age-pattern names only
    where.push(`NOT (gender = 'KIDS' AND name ~* '(ethnic|western|party)')`);
    where.push(`NOT (
      gender = 'KIDS'
      AND parent_id IS NOT NULL
      AND name !~* '(0\\s*[-–]\\s*2|3\\s*[-–]\\s*5|6\\s*[-–]\\s*9|10\\s*[-–]\\s*14)'
    )`);
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await pool_1.db.query(`SELECT id, name, slug, type, gender, parent_id
     FROM product_categories
     ${clause}
     ORDER BY name`, params);
    const items = rows.map((row) => (0, case_1.keysToCamel)(row));
    return res.json({ items });
};
exports.listProductCategories = listProductCategories;
const getProductVariants = async (req, res) => {
    const productId = String(req.params.id);
    const { rows } = await pool_1.db.query(`SELECT
       vc.id,
       vc.color_name,
       vc.color_image_url,
       vs.size,
       vs.stock
     FROM product_variant_colors vc
     INNER JOIN products p ON p.id = vc.product_id
     LEFT JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id
     WHERE vc.product_id = $1
       AND p.is_active = TRUE
     ORDER BY vc.color_name ASC, vs.size ASC`, [productId]);
    const colorsById = new Map();
    for (const row of rows) {
        const id = String(row.id);
        const existing = colorsById.get(id) ??
            (() => {
                const next = {
                    id,
                    colorName: String(row.color_name ?? ""),
                    colorImage: row.color_image_url ? withCdn(String(row.color_image_url)) : null,
                    sizes: []
                };
                colorsById.set(id, next);
                return next;
            })();
        if (row.size) {
            existing.sizes.push({ size: String(row.size), stock: Number(row.stock ?? 0) });
        }
    }
    return res.json({ items: Array.from(colorsById.values()) });
};
exports.getProductVariants = getProductVariants;
const getSimilarProducts = async (req, res) => {
    const productId = String(req.params.id);
    const ownerResult = await pool_1.db.query(`SELECT s.owner_user_id
     FROM products p
     INNER JOIN shops s ON s.id = p.shop_id
     WHERE p.id = $1`, [productId]);
    const ownerId = ownerResult.rows[0]?.owner_user_id;
    if (!ownerId) {
        return res.json({ items: [] });
    }
    const { rows } = await pool_1.db.query(`SELECT
      p.id,
      p.slug,
      p.name,
      p.price,
      p.quantity,
      p.district,
      p.images->>0 AS main_image,
      (COALESCE(s.total_stock, 0) > 0) AS in_stock
     FROM products p
     INNER JOIN shops sh ON sh.id = p.shop_id
     LEFT JOIN product_stock_summary s ON s.product_id = p.id
     WHERE sh.owner_user_id = $1
       AND p.id <> $2
       AND p.is_active = TRUE
     ORDER BY p.created_at DESC
     LIMIT 6`, [ownerId, productId]);
    const items = rows.map((row) => {
        const mapped = (0, case_1.keysToCamel)(row);
        if (mapped.mainImage) {
            mapped.mainImage = withCdn(mapped.mainImage);
        }
        return mapped;
    });
    return res.json({ items });
};
exports.getSimilarProducts = getSimilarProducts;
const adminDeleteProduct = async (req, res) => {
    const productId = String(req.params.id);
    const { rows } = await pool_1.db.query(`UPDATE products
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1
     RETURNING id`, [productId]);
    if (!rows[0]) {
        return res.status(404).json({ error: "Product not found" });
    }
    await (0, cache_1.invalidatePattern)("cache:products:*");
    return res.json({ id: rows[0].id });
};
exports.adminDeleteProduct = adminDeleteProduct;
const listAdminProducts = async (req, res) => {
    const query = adminListSchema.parse(req.query);
    const params = [];
    const where = [];
    if (query.isActive !== undefined) {
        params.push(query.isActive);
        where.push(`p.is_active = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await pool_1.db.query(`SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.price,
      p.is_active,
      p.images,
      p.created_at,
      s.id AS seller_id,
      s.name AS seller_name
     FROM products p
     INNER JOIN shops s ON s.id = p.shop_id
     ${clause}
     ORDER BY p.created_at DESC`, params);
    const items = rows.map((row) => {
        const mapped = (0, case_1.keysToCamel)(row);
        const images = (mapped.images ?? []).map((img) => withCdn(String(img)));
        return {
            product: {
                id: mapped.id,
                slug: mapped.slug,
                name: mapped.name,
                description: mapped.description ?? null,
                price: mapped.price,
                isActive: mapped.isActive,
                images
            },
            seller: {
                id: mapped.sellerId,
                name: mapped.sellerName
            },
            variants: []
        };
    });
    return res.json({ items });
};
exports.listAdminProducts = listAdminProducts;
//# sourceMappingURL=productsController.js.map