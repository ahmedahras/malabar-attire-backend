import { Request, Response } from "express";
import {
  getDashboardSummary,
  getLowStockProducts,
  getRefundsSummary,
  getSalesTrend,
  getTopProducts
} from "./sellerDashboard.service";
import { getShopByOwner } from "../sellers/sellers.service";
import { getCache, setCache } from "../../utils/cache";

const getShopIdForSeller = async (userId: string) => {
  const shop = await getShopByOwner(userId);
  return shop?.id ?? null;
};

export const getSummary = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const shopId = await getShopIdForSeller(req.user.sub);
  if (!shopId) {
    return res.status(404).json({ error: "Shop not found" });
  }
  const cacheKey = `cache:dashboard:summary:${shopId}`;
  const cached = await getCache<Record<string, unknown>>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const summary = await getDashboardSummary(shopId, req.user.sub);
  await setCache(cacheKey, summary, 30);
  return res.json(summary);
};

export const getSalesTrendHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const shopId = await getShopIdForSeller(req.user.sub);
  if (!shopId) {
    return res.status(404).json({ error: "Shop not found" });
  }
  const statusParam = String(req.query.status ?? "PAID").toUpperCase();
  const status =
    statusParam === "DELIVERED" || statusParam === "ALL" ? statusParam : "PAID";
  const cacheKey = `cache:dashboard:sales-trend:${shopId}:${status}`;
  const cached = await getCache<{ items: Array<Record<string, unknown>> }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const trend = await getSalesTrend(shopId, status);
  const response = { items: trend };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const getTopProductsHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const shopId = await getShopIdForSeller(req.user.sub);
  if (!shopId) {
    return res.status(404).json({ error: "Shop not found" });
  }
  const statusParam = String(req.query.status ?? "PAID").toUpperCase();
  const status =
    statusParam === "DELIVERED" || statusParam === "ALL" ? statusParam : "PAID";
  const limit = Math.min(Math.max(Number(req.query.limit ?? 10), 1), 50);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const cacheKey = `cache:dashboard:top-products:${shopId}:${status}:${limit}:${offset}`;
  const cached = await getCache<{ items: Array<Record<string, unknown>> }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const items = await getTopProducts(shopId, status, limit, offset);
  const response = { items };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const getLowStockHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const shopId = await getShopIdForSeller(req.user.sub);
  if (!shopId) {
    return res.status(404).json({ error: "Shop not found" });
  }
  const items = await getLowStockProducts(shopId);
  return res.json({ items });
};

export const getRefundsHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const shopId = await getShopIdForSeller(req.user.sub);
  if (!shopId) {
    return res.status(404).json({ error: "Shop not found" });
  }
  const summary = await getRefundsSummary(shopId);
  return res.json(summary);
};
