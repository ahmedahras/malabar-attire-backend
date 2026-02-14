import { Request, Response } from "express";
import { z } from "zod";
import { getAdminOrderDetail, getOrdersForAdmin } from "../services/ordersService";

const querySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z
    .enum([
      "CREATED",
      "PAID",
      "PAYMENT_STOCK_FAILED",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED"
    ])
    .optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  sellerId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(64).optional()
});

const paramsSchema = z.object({
  orderId: z.string().uuid()
});

const parsePositiveNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const listOrdersForAdmin = async (req: Request, res: Response) => {
  const query = querySchema.parse(req.query);

  const page = parsePositiveNumber(query.page, 1);
  const limit = Math.min(parsePositiveNumber(query.limit, 20), 100);

  const { data, pagination } = await getOrdersForAdmin(
    {
      status: query.status,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      sellerId: query.sellerId,
      customerId: query.customerId,
      search: query.search?.trim()
    },
    { page, limit }
  );

  return res.json({ data, pagination });
};

export const getOrderDetailForAdmin = async (req: Request, res: Response) => {
  const { orderId } = paramsSchema.parse(req.params);

  const detail = await getAdminOrderDetail(orderId);
  if (!detail) {
    return res.status(404).json({ error: "Order not found" });
  }

  return res.json(detail);
};
