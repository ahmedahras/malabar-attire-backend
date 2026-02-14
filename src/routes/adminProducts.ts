import { Router } from "express";
import { adminDeleteProduct, listAdminProducts } from "../controllers/productsController";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";

export const adminProductsRouter = Router();

adminProductsRouter.get(
  "/",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  listAdminProducts
);

adminProductsRouter.delete(
  "/:id",
  requireAuth,
  rateLimitProtected,
  requireRole("admin"),
  adminDeleteProduct
);
