import { Request, Response } from "express";
import { z } from "zod";
import { parsePagination } from "../utils/pagination";
import {
  createAdminPayoutBatch,
  getAdminPayoutDetails,
  getAdminPayoutStats,
  listAdminPayouts,
  updateAdminPayoutStatus
} from "../services/adminPayout.service";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
  status: z.enum(["PENDING", "PROCESSING", "PAID"]).optional()
});

const payoutParamsSchema = z.object({
  payoutId: z.string().uuid()
});

const payoutStatusSchema = z.object({
  status: z.enum(["PROCESSING", "PAID"])
});

const createPayoutSchema = z.object({
  seller_id: z.string().uuid(),
  seller_payout_amount: z.coerce.number().positive()
});

export const listPayoutBatches = async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query ?? {});
  const pagination = parsePagination({
    page: query.page,
    limit: query.limit,
    defaultLimit: 20,
    maxLimit: 100
  });

  const data = await listAdminPayouts({
    limit: pagination.limit,
    offset: pagination.offset,
    status: query.status
  });

  return res.json({
    items: data.items,
    total: data.total,
    limit: pagination.limit,
    offset: pagination.offset
  });
};

export const getPayoutBatchById = async (req: Request, res: Response) => {
  const { payoutId } = payoutParamsSchema.parse(req.params);
  const details = await getAdminPayoutDetails(payoutId);
  if (!details) {
    return res.status(404).json({ error: "Payout not found" });
  }
  return res.json(details);
};

export const createPayoutBatch = async (req: Request, res: Response) => {
  const body = createPayoutSchema.parse(req.body ?? {});
  if (!req.user?.sub) {
    return res.status(401).json({ error: "Missing token" });
  }

  const result = await createAdminPayoutBatch({
    sellerId: body.seller_id,
    payoutAmount: body.seller_payout_amount,
    createdBy: req.user.sub
  });

  if (!result.ok && result.reason === "invalid_amount") {
    return res.status(400).json({ error: "Invalid payout amount" });
  }
  if (!result.ok && result.reason === "seller_not_found") {
    return res.status(404).json({ error: "Seller not found" });
  }
  if (!result.ok && result.reason === "insufficient_balance") {
    return res.status(400).json({
      error: "seller_payout_amount exceeds seller available balance",
      available_balance: result.availableBalance
    });
  }
  if (!result.ok && result.reason === "invalid_margin") {
    return res.status(400).json({ error: "Invalid payout margin calculation" });
  }

  if (!result.ok) {
    return res.status(500).json({ error: "Unable to create payout batch" });
  }

  return res.status(201).json({
    payout_id: result.payoutId,
    seller_id: result.sellerId,
    total_amount: result.totalAmount,
    platform_margin: result.margin,
    status: result.status
  });
};

export const patchPayoutBatchStatus = async (req: Request, res: Response) => {
  const { payoutId } = payoutParamsSchema.parse(req.params);
  const body = payoutStatusSchema.parse(req.body ?? {});
  if (!req.user?.sub) {
    return res.status(401).json({ error: "Missing token" });
  }

  const result = await updateAdminPayoutStatus({
    payoutId,
    newStatus: body.status,
    changedBy: req.user.sub
  });

  if (!result.ok && result.reason === "not_found") {
    return res.status(404).json({ error: "Payout not found" });
  }

  if (!result.ok && result.reason === "invalid_transition") {
    return res.status(400).json({
      error: "Invalid payout status transition",
      current_status: result.currentStatus
    });
  }

  return res.json({
    payout_id: payoutId,
    previous_status: result.previousStatus,
    status: result.status
  });
};

export const getPayoutBatchStats = async (_req: Request, res: Response) => {
  const stats = await getAdminPayoutStats();
  return res.json(stats);
};
