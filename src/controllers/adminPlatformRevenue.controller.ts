import { Request, Response } from "express";
import {
  getPlatformRevenueBySeller,
  getPlatformRevenueSummary
} from "../services/adminPayout.service";

export const getAdminPlatformRevenue = async (_req: Request, res: Response) => {
  const summary = await getPlatformRevenueSummary();
  return res.json(summary);
};

export const getAdminPlatformRevenueBySeller = async (_req: Request, res: Response) => {
  const items = await getPlatformRevenueBySeller();
  return res.json(items);
};
