import { Request, Response } from "express";
import { db } from "../db/pool";
import { env } from "../config/env";

const monthQuerySchema = /^\d{4}-(0[1-9]|1[0-2])$/;

const parseMonthStart = (month: unknown) => {
  if (typeof month !== "string" || !monthQuerySchema.test(month)) {
    return null;
  }
  return `${month}-01`;
};

const escapeCsv = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

export const exportAdminPlatformRevenueCsv = async (req: Request, res: Response) => {
  const monthStart = parseMonthStart(req.query?.month);
  if (!monthStart) {
    return res.status(400).json({ error: "Invalid month format. Use YYYY-MM." });
  }

  const filename = `platform-revenue-${req.query.month}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  res.status(200);

  res.write("Date,Seller ID,Seller Name,Payout ID,Revenue Amount,Reason\n");

  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const result = await db.query<{
      date: string;
      seller_id: string;
      seller_name: string | null;
      payout_id: string | null;
      amount: string | number;
      reason: string | null;
    }>(
      `SELECT pl.created_at::date AS date,
              pl.seller_id,
              COALESCE(sh.name, u.full_name) AS seller_name,
              pl.payout_id,
              pl.amount,
              pl.reason
       FROM platform_ledger pl
       LEFT JOIN shops sh ON sh.owner_user_id = pl.seller_id
       LEFT JOIN users u ON u.id = pl.seller_id
       WHERE pl.type = 'REVENUE'
         AND date_trunc('month', pl.created_at) = date_trunc('month', $1::date)
       ORDER BY pl.created_at ASC
       LIMIT $2 OFFSET $3`,
      [monthStart, pageSize, offset]
    );

    if (result.rows.length === 0) {
      break;
    }

    for (const row of result.rows) {
      const line = [
        escapeCsv(row.date),
        escapeCsv(row.seller_id),
        escapeCsv(row.seller_name ?? ""),
        escapeCsv(row.payout_id ?? ""),
        escapeCsv(Number(row.amount ?? 0)),
        escapeCsv(row.reason ?? "")
      ].join(",");
      res.write(`${line}\n`);
    }

    offset += result.rows.length;
    if (result.rows.length < pageSize) {
      break;
    }
  }

  res.end();
};

export const getAdminPlatformRevenueGstReport = async (req: Request, res: Response) => {
  const month = req.query?.month;
  const monthStart = parseMonthStart(month);
  if (!monthStart || typeof month !== "string") {
    return res.status(400).json({ error: "Invalid month format. Use YYYY-MM." });
  }

  const result = await db.query<{ taxable_value: string | number }>(
    `SELECT COALESCE(SUM(amount), 0) AS taxable_value
     FROM platform_ledger
     WHERE type = 'REVENUE'
       AND date_trunc('month', created_at) = date_trunc('month', $1::date)`,
    [monthStart]
  );

  const taxableValue = Number(result.rows[0]?.taxable_value ?? 0);
  const gstRate = Number(env.PLATFORM_GST_RATE ?? 18);
  const gstAmount = Number((taxableValue * (gstRate / 100)).toFixed(2));
  const totalWithGst = Number((taxableValue + gstAmount).toFixed(2));

  return res.json({
    month,
    taxable_value: taxableValue,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    total_with_gst: totalWithGst
  });
};
