import { Request, Response } from "express";
import { z } from "zod";
import { parsePagination } from "../../utils/pagination";
import { getEarningsSummary, getLedgerHistory, getPayoutHistory } from "./earnings.service";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20)
});

const getSellerIdFromRequest = (req: Request) => {
  if (!req.user) {
    return null;
  }
  return req.user.sub;
};

export const getMyEarningsSummary = async (req: Request, res: Response) => {
  const sellerId = getSellerIdFromRequest(req);
  if (!sellerId) {
    return res.status(401).json({ error: "Missing token" });
  }

  const summary = await getEarningsSummary(sellerId);
  return res.json({
    total_earned: summary.totalEarned,
    available_for_payout: summary.availableForPayout,
    in_hold: summary.inHold,
    already_paid: summary.alreadyPaid,
    rto_deductions: summary.rtoDeductions
  });
};

export const getMyLedgerHistory = async (req: Request, res: Response) => {
  const sellerId = getSellerIdFromRequest(req);
  if (!sellerId) {
    return res.status(401).json({ error: "Missing token" });
  }

  const parsed = paginationSchema.parse(req.query ?? {});
  const pagination = parsePagination({
    page: parsed.page,
    limit: parsed.limit,
    defaultLimit: 20,
    maxLimit: 100
  });

  const result = await getLedgerHistory(sellerId, pagination.limit, pagination.offset);
  return res.json({
    items: result.items,
    total: result.total,
    limit: pagination.limit,
    offset: pagination.offset
  });
};

export const getMyPayoutHistory = async (req: Request, res: Response) => {
  const sellerId = getSellerIdFromRequest(req);
  if (!sellerId) {
    return res.status(401).json({ error: "Missing token" });
  }

  const parsed = paginationSchema.parse(req.query ?? {});
  const pagination = parsePagination({
    page: parsed.page,
    limit: parsed.limit,
    defaultLimit: 10,
    maxLimit: 100
  });

  const result = await getPayoutHistory(sellerId, pagination.limit, pagination.offset);
  return res.json({
    items: result.items,
    total: result.total,
    limit: pagination.limit,
    offset: pagination.offset
  });
};

