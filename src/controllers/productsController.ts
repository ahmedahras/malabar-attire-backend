import { Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/pool";
import { keysToCamel } from "../utils/case";
import { logAudit } from "../utils/audit";
import { env } from "../config/env";
import { getCache, invalidatePattern, setCache } from "../utils/cache";

const parseCategoryIds = (value: unknown) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
};

const parseCategoryTypes = (value: unknown) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
};

const createProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  fabric: z.string().optional(),
  fit: z.string().optional(),
  occasion: z.string().optional(),
  careInstructions: z.string().optional(),
  categoryIds: z.array(z.string().uuid()).min(1),
  district: z.string().min(2),
  price: z.number().positive(),
  sizeChart: z.record(z.string(), z.any()).optional(),
  images: z.array(z.string().min(1)).default([]),
  colors: z
    .array(
      z.object({
        colorName: z.string().min(1),
        colorImageUrl: z.string().min(1).optional(),
        sizes: z
          .array(
            z.object({
              size: z.string().min(1),
              stock: z.number().int().nonnegative().default(0)
            })
          )
          .min(1)
      })
    )
    .min(1)
});

const listProductsSchema = z.object({
  category: z.string().optional(),
  gender: z.string().optional(),
  categoryIds: z.preprocess(parseCategoryIds, z.array(z.string().uuid()).min(1).optional()),
  size: z.string().optional(),
  district: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  inStock: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
  page: z.coerce.number().int().positive().optional(),
  sort: z.string().optional()
});

const adminListSchema = z.object({
  isActive: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true"))
});

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  fabric: z.string().optional(),
  fit: z.string().optional(),
  occasion: z.string().optional(),
  careInstructions: z.string().optional(),
  categoryIds: z.array(z.string().uuid()).min(1).optional(),
  district: z.string().min(2).optional(),
  price: z.number().positive().optional(),
  sizeChart: z.record(z.string(), z.any()).optional(),
  images: z.array(z.string().min(1)).optional(),
  colors: z
    .array(
      z.object({
        colorName: z.string().min(1),
        colorImageUrl: z.string().min(1).optional(),
        sizes: z
          .array(
            z.object({
              size: z.string().min(1),
              stock: z.number().int().nonnegative().default(0)
            })
          )
          .min(1)
      })
    )
    .optional()
});

const normalizeImageName = (value: string) => {
  const stripped = value.split("?")[0] ?? value;
  const parts = stripped.split("/");
  return parts[parts.length - 1] || stripped;
};

const withCdn = (value: string) => {
  if (!value) return value;
  // If CDN is configured, strip to filename and prefix with CDN base
  if (env.CDN_BASE_URL) {
    const name = normalizeImageName(value);
    return `${env.CDN_BASE_URL.replace(/\/$/, "")}/products/${name}`;
  }
  // No CDN — return the value as stored (full S3 key or https URL, no query params)
  return value.split("?")[0] ?? value;
};

const buildCacheKey = (base: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${base}:${JSON.stringify(entries)}`;
};

const buildFilters = (query: z.infer<typeof listProductsSchema>) => {
  const where: string[] = [];
  const params: Array<string | number | boolean | string[]> = [];

  where.push(`p.is_active = TRUE`);

  if (query.categoryIds?.length) {
    params.push(query.categoryIds);
    where.push(
      `EXISTS (
        SELECT 1 FROM product_category_map pcm
        WHERE pcm.product_id = p.id
          AND pcm.category_id = ANY($${params.length}::uuid[])
      )`
    );
  }

  if (query.gender?.trim()) {
    params.push(query.gender.trim().toUpperCase());
    where.push(
      `EXISTS (
        SELECT 1
        FROM product_category_map pcm
        INNER JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE pcm.product_id = p.id
          AND pc.gender = $${params.length}
      )`
    );
  }

  if (query.category?.trim()) {
    params.push(`%${query.category.trim()}%`);
    where.push(
      `EXISTS (
        SELECT 1
        FROM product_category_map pcm
        INNER JOIN product_categories pc ON pc.id = pcm.category_id
        WHERE pcm.product_id = p.id
          AND pc.name ILIKE $${params.length}
      )`
    );
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
    where.push(
      `EXISTS (
        SELECT 1
        FROM product_variant_colors vc
        INNER JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id
        WHERE vc.product_id = p.id
          AND vs.size = $${params.length}
      )`
    );
  }

  if (query.inStock) {
    where.push(`COALESCE(s.total_stock, 0) > 0`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { clause, params };
};

export const createProduct = async (req: Request, res: Response) => {
  const body = createProductSchema.parse(req.body);
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const totalStock = body.colors.reduce(
    (sum, color) => sum + color.sizes.reduce((acc, s) => acc + Number(s.stock ?? 0), 0),
    0
  );

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const shopResult = await client.query(
      `SELECT id FROM shops WHERE owner_user_id = $1`,
      [req.user.sub]
    );
    const shopId = shopResult.rows[0]?.id as string | undefined;
    if (!shopId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Shop not found" });
    }

    const sellerRisk = await client.query(
      `SELECT sb.risk_flag
       FROM shops s
       INNER JOIN seller_balance sb ON sb.seller_id = s.owner_user_id
       WHERE s.id = $1`,
      [shopId]
    );
    if (sellerRisk.rows[0]?.risk_flag) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Seller is under financial review" });
    }

    const { ensurePublishingAllowedForSeller } = await import("../services/sellerModeEnforcer");
    const decision = await ensurePublishingAllowedForSeller(req.user.sub);
    if (!decision.allowed) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: decision.reason });
    }

    const categoryIds = body.categoryIds;
    const categoryResult = await client.query(
      `SELECT id, name, gender, parent_id
       FROM product_categories
       WHERE id = ANY($1::uuid[])`,
      [categoryIds]
    );
    if (categoryResult.rows.length !== categoryIds.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid categories" });
    }
    const hasKidsRoot = categoryResult.rows.some(
      (c) => c.gender === "KIDS" && c.parent_id === null
    );
    if (hasKidsRoot) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "For KIDS products, you must select an age group category (child category), not just Kids Boy/Girl."
      });
    }
    const categoriesById = new Map<string, string>(
      categoryResult.rows.map((row) => [row.id as string, row.name as string])
    );
    const primaryCategoryName =
      categoriesById.get(categoryIds[0]) ?? categoryResult.rows[0]?.name ?? "Uncategorized";

    const { rows } = await client.query(
      `INSERT INTO products
       (shop_id, name, description, fabric, fit, occasion, care_instructions,
        category, district, price, quantity, size_chart, images, is_active, status, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, 'LIVE', TRUE)
       RETURNING id`,
      [
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
      ]
    );

    const productId = rows[0].id as string;

    await client.query(
      `UPDATE products
       SET slug = COALESCE(slug, id::text)
       WHERE id = $1`,
      [productId]
    );

    await client.query(
      `INSERT INTO product_category_map (product_id, category_id)
       SELECT $1, unnest($2::uuid[])`,
      [productId, categoryIds]
    );

    for (const color of body.colors) {
      const colorResult = await client.query(
        `INSERT INTO product_variant_colors (product_id, color_name, color_image_url)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [productId, color.colorName.trim(), color.colorImageUrl ? normalizeImageName(color.colorImageUrl) : null]
      );
      const variantColorId = colorResult.rows[0]?.id as string;
      for (const sizeRow of color.sizes) {
        await client.query(
          `INSERT INTO product_variant_sizes (variant_color_id, size, stock)
           VALUES ($1, $2, $3)`,
          [variantColorId, sizeRow.size.trim(), Number(sizeRow.stock ?? 0)]
        );
      }
    }

    await logAudit({
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
    await invalidatePattern("cache:products:*");
    return res.status(201).json({ id: productId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listSellerProducts = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const shopResult = await db.query(
    `SELECT id FROM shops WHERE owner_user_id = $1`,
    [req.user.sub]
  );
  const shopId = shopResult.rows[0]?.id as string | undefined;
  if (!shopId) {
    return res.status(400).json({ error: "Shop not found" });
  }

  const { rows } = await db.query(
    `SELECT
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
     ORDER BY p.created_at DESC`,
    [shopId]
  );

  const items = rows.map((row) => {
    const mapped = keysToCamel(row) as { mainImage?: string | null };
    if (mapped.mainImage) {
      mapped.mainImage = withCdn(mapped.mainImage);
    }
    return mapped;
  });

  return res.json({ items });
};

export const updateSellerProduct = async (req: Request, res: Response) => {
  const body = updateProductSchema.parse(req.body ?? {});
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const productId = String(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const shopResult = await client.query(
      `SELECT id FROM shops WHERE owner_user_id = $1`,
      [req.user.sub]
    );
    const shopId = shopResult.rows[0]?.id as string | undefined;
    if (!shopId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Shop not found" });
    }

    const ownerCheck = await client.query(
      `SELECT id FROM products WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [productId, shopId]
    );
    if (!ownerCheck.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    const updates: string[] = [];
    const params: Array<string | number | null | Record<string, any>> = [];
    const push = (field: string, value: string | number | null | Record<string, any>) => {
      params.push(value);
      updates.push(`${field} = $${params.length}`);
    };

    if (body.name !== undefined) push("name", body.name);
    if (body.description !== undefined) push("description", body.description ?? null);
    if (body.fabric !== undefined) push("fabric", body.fabric ?? null);
    if (body.fit !== undefined) push("fit", body.fit ?? null);
    if (body.occasion !== undefined) push("occasion", body.occasion ?? null);
    if (body.careInstructions !== undefined) push("care_instructions", body.careInstructions ?? null);
    if (body.categoryIds !== undefined) {
      const categoryResult = await client.query(
        `SELECT id, name, gender, parent_id
         FROM product_categories
         WHERE id = ANY($1::uuid[])`,
        [body.categoryIds]
      );
      if (categoryResult.rows.length !== body.categoryIds.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid categories" });
      }
      const hasKidsRoot = categoryResult.rows.some(
        (c) => c.gender === "KIDS" && c.parent_id === null
      );
      if (hasKidsRoot) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "For KIDS products, you must select an age group category (child category), not just Kids Boy/Girl."
        });
      }
      const categoriesById = new Map<string, string>(
        categoryResult.rows.map((row) => [row.id as string, row.name as string])
      );
      const primaryCategoryName =
        categoriesById.get(body.categoryIds[0]) ??
        categoryResult.rows[0]?.name ??
        "Uncategorized";
      push("category", primaryCategoryName);
    }
    if (body.district !== undefined) push("district", body.district);
    if (body.price !== undefined) push("price", body.price);
    if (body.sizeChart !== undefined) push("size_chart", body.sizeChart ?? null);
    if (body.images !== undefined) {
      push("images", JSON.stringify(body.images.map(normalizeImageName)));
    }
    if (updates.length) {
      params.push(productId);
      await client.query(
        `UPDATE products
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${params.length}`,
        params
      );
    }

    if (body.categoryIds !== undefined) {
      await client.query(`DELETE FROM product_category_map WHERE product_id = $1`, [productId]);
      await client.query(
        `INSERT INTO product_category_map (product_id, category_id)
         SELECT $1, unnest($2::uuid[])`,
        [productId, body.categoryIds]
      );
    }

    if (body.colors) {
      const nextTotalStock = body.colors.reduce(
        (sum, color) => sum + color.sizes.reduce((acc, s) => acc + Number(s.stock ?? 0), 0),
        0
      );
      await client.query(`UPDATE products SET quantity = $2, updated_at = NOW() WHERE id = $1`, [
        productId,
        nextTotalStock
      ]);

      await client.query(`DELETE FROM product_variant_colors WHERE product_id = $1`, [productId]);
      for (const color of body.colors) {
        const colorResult = await client.query(
          `INSERT INTO product_variant_colors (product_id, color_name, color_image_url)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [
            productId,
            color.colorName.trim(),
            color.colorImageUrl ? normalizeImageName(color.colorImageUrl) : null
          ]
        );
        const variantColorId = colorResult.rows[0]?.id as string;
        for (const sizeRow of color.sizes) {
          await client.query(
            `INSERT INTO product_variant_sizes (variant_color_id, size, stock)
             VALUES ($1, $2, $3)`,
            [variantColorId, sizeRow.size.trim(), Number(sizeRow.stock ?? 0)]
          );
        }
      }
    }

    await client.query("COMMIT");
    await invalidatePattern("cache:products:*");
    return res.json({ id: productId });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listProducts = async (req: Request, res: Response) => {
  const query = listProductsSchema.parse(req.query);
  const offset =
    req.query.page && !req.query.offset
      ? (Number(query.page ?? 1) - 1) * query.limit
      : query.offset;
  const cacheKey = buildCacheKey("cache:products", {
    ...req.query,
    limit: query.limit,
    offset
  });
  const cached = await getCache<{
    items: Array<Record<string, unknown>>;
    limit: number;
    offset: number;
    total: number;
  }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const { clause, params } = buildFilters(query);

  const orderBy =
    query.sort === "priority_desc" || !query.sort
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
    db.query(itemsQuery, [...params, query.limit, offset]),
    db.query(countQuery, params)
  ]);

  const items = itemsResult.rows.map((row) => {
    const mapped = keysToCamel(row) as {
      mainImage?: string | null;
      images?: string[] | null;
    };
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
  await setCache(cacheKey, response, 60);
  return res.json(response);
};

export const getProductById = async (req: Request, res: Response) => {
  const productId = String(req.params.id);

  const productResult = await db.query(
    `SELECT
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
     WHERE p.id = $1`,
    [productId]
  );

  if (!productResult.rows[0]) {
    return res.status(404).json({ error: "Product not found" });
  }

  const isActive = productResult.rows[0].is_active as boolean;
  if (!isActive) {
    const actor = req.user;
    const ownerId = productResult.rows[0].shop_owner_id as string;
    if (!actor || (actor.role !== "admin" && actor.sub !== ownerId)) {
      return res.status(404).json({ error: "Product not found" });
    }
  }

  const [colorsResult, categoriesResult] = await Promise.all([
    db.query(
      `SELECT
         vc.id,
         vc.color_name,
         vc.color_image_url,
         vs.size,
         vs.stock
       FROM product_variant_colors vc
       LEFT JOIN product_variant_sizes vs ON vs.variant_color_id = vc.id
       WHERE vc.product_id = $1
       ORDER BY vc.color_name ASC, vs.size ASC`,
      [productId]
    ),
    db.query(
      `SELECT pc.id, pc.name, pc.slug
       FROM product_categories pc
       INNER JOIN product_category_map pcm ON pcm.category_id = pc.id
       WHERE pcm.product_id = $1
       ORDER BY pc.name`,
      [productId]
    )
  ]);

  const colorsById = new Map<
    string,
    {
      id: string;
      colorName: string;
      colorImage: string | null;
      sizes: Array<{ size: string; stock: number }>;
    }
  >();
  for (const row of colorsResult.rows) {
    const id = String(row.id);
    const existing =
      colorsById.get(id) ??
      (() => {
        const next = {
          id,
          colorName: String(row.color_name ?? ""),
          colorImage: row.color_image_url ? withCdn(String(row.color_image_url)) : null,
          sizes: [] as Array<{ size: string; stock: number }>
        };
        colorsById.set(id, next);
        return next;
      })();

    if (row.size) {
      existing.sizes.push({ size: String(row.size), stock: Number(row.stock ?? 0) });
    }
  }
  const colors = Array.from(colorsById.values());
  const categories = categoriesResult.rows.map((row) => keysToCamel(row));
  const row = keysToCamel(productResult.rows[0]) as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    fabric: string | null;
    fit: string | null;
    occasion: string | null;
    careInstructions: string | null;
    category: string;
    district: string;
    price: number;
    images: unknown[] | null;
    sizeChart: unknown | null;
    priorityScore: number;
    ratingAvg: number;
    ratingCount: number;
    createdAt: string;
    totalStock: number;
    quantity: number;
    shopId: string;
    shopName: string;
    shopDistrict: string;
    shopLogoUrl: string | null;
    shopIsApproved: boolean;
    shopOwnerId: string;
    isActive: boolean;
  };
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

export const listProductCategories = async (req: Request, res: Response) => {
  const types = parseCategoryTypes(req.query.type);
  const gender = typeof req.query.gender === "string" ? req.query.gender : undefined;
  const where: string[] = [];
  const params: string[] = [];
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
  where.push(
    `NOT (
      gender = 'KIDS'
      AND parent_id IS NOT NULL
      AND name !~* '(0\\s*[-–]\\s*2|3\\s*[-–]\\s*5|6\\s*[-–]\\s*9|10\\s*[-–]\\s*14)'
    )`
  );
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await db.query(
    `SELECT id, name, slug, type, gender, parent_id
     FROM product_categories
     ${clause}
     ORDER BY name`,
    params
  );
  const items = rows.map((row) => keysToCamel(row));
  return res.json({ items });
};

export const getProductVariants = async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  const { rows } = await db.query(
    `SELECT
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
     ORDER BY vc.color_name ASC, vs.size ASC`,
    [productId]
  );

  const colorsById = new Map<
    string,
    { id: string; colorName: string; colorImage: string | null; sizes: Array<{ size: string; stock: number }> }
  >();
  for (const row of rows) {
    const id = String(row.id);
    const existing =
      colorsById.get(id) ??
      (() => {
        const next = {
          id,
          colorName: String(row.color_name ?? ""),
          colorImage: row.color_image_url ? withCdn(String(row.color_image_url)) : null,
          sizes: [] as Array<{ size: string; stock: number }>
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

export const getSimilarProducts = async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  const ownerResult = await db.query(
    `SELECT s.owner_user_id
     FROM products p
     INNER JOIN shops s ON s.id = p.shop_id
     WHERE p.id = $1`,
    [productId]
  );
  const ownerId = ownerResult.rows[0]?.owner_user_id as string | undefined;
  if (!ownerId) {
    return res.json({ items: [] });
  }

  const { rows } = await db.query(
    `SELECT
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
     LIMIT 6`,
    [ownerId, productId]
  );

  const items = rows.map((row) => {
    const mapped = keysToCamel(row) as { mainImage?: string | null };
    if (mapped.mainImage) {
      mapped.mainImage = withCdn(mapped.mainImage);
    }
    return mapped;
  });

  return res.json({ items });
};

export const adminDeleteProduct = async (req: Request, res: Response) => {
  const productId = String(req.params.id);
  const { rows } = await db.query(
    `UPDATE products
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [productId]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "Product not found" });
  }
  await invalidatePattern("cache:products:*");
  return res.json({ id: rows[0].id });
};

export const listAdminProducts = async (req: Request, res: Response) => {
  const query = adminListSchema.parse(req.query);
  const params: Array<string | boolean> = [];
  const where: string[] = [];
  if (query.isActive !== undefined) {
    params.push(query.isActive);
    where.push(`p.is_active = $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await db.query(
    `SELECT
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
     ORDER BY p.created_at DESC`,
    params
  );

  const items = rows.map((row) => {
    const mapped = keysToCamel(row) as {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      price: number;
      isActive: boolean;
      images: unknown[] | null;
      sellerId: string;
      sellerName: string;
    };
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
