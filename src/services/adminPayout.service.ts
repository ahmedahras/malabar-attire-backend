import { db } from "../db/pool";

type PayoutStatus = "PENDING" | "PROCESSING" | "PAID";

const allowedTransitions: Record<PayoutStatus, PayoutStatus[]> = {
  PENDING: ["PROCESSING"],
  PROCESSING: ["PAID"],
  PAID: []
};

export const listAdminPayouts = async (input: {
  limit: number;
  offset: number;
  status?: PayoutStatus;
}) => {
  const filters: string[] = [];
  const params: Array<string | number> = [];

  if (input.status) {
    params.push(input.status);
    filters.push(`sp.status = $${params.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  params.push(input.limit);
  const limitParam = `$${params.length}`;
  params.push(input.offset);
  const offsetParam = `$${params.length}`;

  const [itemsResult, countResult] = await Promise.all([
    db.query<{
      payout_id: string;
      seller_id: string;
      seller_name: string | null;
      total_amount: string | number;
      status: string;
      created_at: string;
      paid_at: string | null;
    }>(
      `SELECT sp.id AS payout_id,
              sp.seller_id,
              COALESCE(sh.name, u.full_name) AS seller_name,
              sp.total_amount,
              sp.status,
              sp.created_at,
              sp.paid_at
       FROM seller_payouts sp
       INNER JOIN users u ON u.id = sp.seller_id
       LEFT JOIN shops sh ON sh.owner_user_id = sp.seller_id
       ${whereClause}
       ORDER BY sp.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    ),
    db.query<{ total: string | number }>(
      `SELECT COUNT(*)::int AS total
       FROM seller_payouts sp
       ${whereClause}`,
      params.slice(0, input.status ? 1 : 0)
    )
  ]);

  return {
    items: itemsResult.rows.map((row) => ({
      payout_id: row.payout_id,
      seller_id: row.seller_id,
      seller_name: row.seller_name,
      total_amount: Number(row.total_amount ?? 0),
      status: row.status,
      created_at: row.created_at,
      paid_at: row.paid_at
    })),
    total: Number(countResult.rows[0]?.total ?? 0)
  };
};

export const createAdminPayoutBatch = async (input: {
  sellerId: string;
  payoutAmount: number;
  createdBy: string;
}) => {
  const amount = Number(input.payoutAmount.toFixed(2));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, reason: "invalid_amount" };
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const sellerResult = await client.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [input.sellerId]
    );
    if (!sellerResult.rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "seller_not_found" };
    }

    const balanceResult = await client.query<{ available_balance: string | number }>(
      `SELECT COALESCE(
                SUM(
                  CASE
                    WHEN type = 'CREDIT' THEN amount
                    WHEN type = 'DEBIT' THEN -amount
                    ELSE 0
                  END
                ),
                0
              ) AS available_balance
       FROM seller_ledger
       WHERE seller_id = $1
         AND settled_at IS NULL`,
      [input.sellerId]
    );

    const availableBalance = Number(balanceResult.rows[0]?.available_balance ?? 0);
    if (amount > availableBalance) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        reason: "insufficient_balance",
        availableBalance
      };
    }
    const margin = Number((availableBalance - amount).toFixed(2));
    if (margin < 0) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "invalid_margin" };
    }

    const payoutResult = await client.query<{ id: string }>(
      `INSERT INTO seller_payouts (seller_id, amount, total_amount, status, cycle_key)
       VALUES ($1, $2, $2, 'PENDING', to_char(NOW(), 'YYYY-MM-DD'))
       RETURNING id`,
      [input.sellerId, amount]
    );

    const payoutId = payoutResult.rows[0]?.id;
    if (!payoutId) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "payout_create_failed" };
    }

    await client.query(
      `INSERT INTO seller_ledger (seller_id, order_id, amount, type, reason, payout_id)
       VALUES ($1, $2, $3, 'DEBIT', 'Admin Payout Batch', $2)`,
      [input.sellerId, payoutId, amount]
    );

    if (margin > 0) {
      await client.query(
        `INSERT INTO platform_ledger (seller_id, payout_id, amount, type, reason)
         VALUES ($1, $2, $3, 'REVENUE', 'Platform Margin')`,
        [input.sellerId, payoutId, margin]
      );
    }

    await client.query(
      `INSERT INTO payout_events (payout_id, previous_status, new_status, changed_by)
       VALUES ($1, 'PENDING', 'PENDING', $2)`,
      [payoutId, input.createdBy]
    );

    await client.query("COMMIT");
    return {
      ok: true as const,
      payoutId,
      sellerId: input.sellerId,
      totalAmount: amount,
      margin,
      status: "PENDING" as const
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getAdminPayoutDetails = async (payoutId: string) => {
  const payoutResult = await db.query<{
    payout_id: string;
    seller_id: string;
    seller_name: string | null;
    total_amount: string | number;
    status: string;
    created_at: string;
    paid_at: string | null;
  }>(
    `SELECT sp.id AS payout_id,
            sp.seller_id,
            COALESCE(sh.name, u.full_name) AS seller_name,
            sp.total_amount,
            sp.status,
            sp.created_at,
            sp.paid_at
     FROM seller_payouts sp
     INNER JOIN users u ON u.id = sp.seller_id
     LEFT JOIN shops sh ON sh.owner_user_id = sp.seller_id
     WHERE sp.id = $1
     LIMIT 1`,
    [payoutId]
  );

  const payout = payoutResult.rows[0];
  if (!payout) return null;

  const ledgerResult = await db.query<{
    id: string;
    order_id: string;
    amount: string | number;
    type: string;
    reason: string;
    created_at: string;
    settled_at: string | null;
  }>(
    `SELECT sl.id,
            sl.order_id,
            sl.amount,
            sl.type,
            sl.reason,
            sl.created_at,
            sl.settled_at
     FROM seller_ledger sl
     WHERE sl.payout_id = $1
     ORDER BY sl.created_at DESC`,
    [payoutId]
  );

  return {
    payout: {
      payout_id: payout.payout_id,
      seller_id: payout.seller_id,
      seller_name: payout.seller_name,
      total_amount: Number(payout.total_amount ?? 0),
      status: payout.status,
      created_at: payout.created_at,
      paid_at: payout.paid_at
    },
    ledger_items: ledgerResult.rows.map((row) => ({
      ledger_id: row.id,
      order_id: row.order_id,
      amount: Number(row.amount ?? 0),
      type: row.type,
      reason: row.reason,
      created_at: row.created_at,
      settled_at: row.settled_at
    }))
  };
};

export const updateAdminPayoutStatus = async (input: {
  payoutId: string;
  newStatus: PayoutStatus;
  changedBy: string;
}) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query<{ status: PayoutStatus }>(
      `SELECT status
       FROM seller_payouts
       WHERE id = $1
       FOR UPDATE`,
      [input.payoutId]
    );

    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "not_found" };
    }

    const nextAllowed = allowedTransitions[current.status] ?? [];
    if (!nextAllowed.includes(input.newStatus)) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        reason: "invalid_transition",
        currentStatus: current.status
      };
    }

    await client.query(
      `UPDATE seller_payouts
       SET status = $2,
           paid_at = CASE WHEN $2 = 'PAID' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
       WHERE id = $1`,
      [input.payoutId, input.newStatus]
    );

    await client.query(
      `INSERT INTO payout_events (payout_id, previous_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [input.payoutId, current.status, input.newStatus, input.changedBy]
    );

    await client.query("COMMIT");
    return { ok: true as const, previousStatus: current.status, status: input.newStatus };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const getAdminPayoutStats = async () => {
  const result = await db.query<{
    pending_total: string | number;
    processing_total: string | number;
    paid_total: string | number;
  }>(
    `SELECT
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'PENDING'), 0) AS pending_total,
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'PROCESSING'), 0) AS processing_total,
       COALESCE(SUM(total_amount) FILTER (WHERE status = 'PAID'), 0) AS paid_total
     FROM seller_payouts`
  );

  return {
    pending_total: Number(result.rows[0]?.pending_total ?? 0),
    processing_total: Number(result.rows[0]?.processing_total ?? 0),
    paid_total: Number(result.rows[0]?.paid_total ?? 0)
  };
};

export const getPlatformRevenueSummary = async () => {
  const result = await db.query<{
    total_revenue: string | number;
    this_month: string | number;
    today: string | number;
  }>(
    `SELECT
       COALESCE(SUM(amount), 0) AS total_revenue,
       COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS this_month,
       COALESCE(SUM(amount) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS today
     FROM platform_ledger
     WHERE type = 'REVENUE'`
  );

  return {
    total_revenue: Number(result.rows[0]?.total_revenue ?? 0),
    this_month: Number(result.rows[0]?.this_month ?? 0),
    today: Number(result.rows[0]?.today ?? 0)
  };
};

export const getPlatformRevenueBySeller = async () => {
  const result = await db.query<{
    seller_id: string;
    seller_name: string | null;
    revenue: string | number;
  }>(
    `SELECT pl.seller_id,
            COALESCE(sh.name, u.full_name) AS seller_name,
            COALESCE(SUM(pl.amount), 0) AS revenue
     FROM platform_ledger pl
     INNER JOIN users u ON u.id = pl.seller_id
     LEFT JOIN shops sh ON sh.owner_user_id = pl.seller_id
     WHERE pl.type = 'REVENUE'
     GROUP BY pl.seller_id, COALESCE(sh.name, u.full_name)
     ORDER BY revenue DESC`
  );

  return result.rows.map((row) => ({
    seller_id: row.seller_id,
    seller_name: row.seller_name,
    revenue: Number(row.revenue ?? 0)
  }));
};
