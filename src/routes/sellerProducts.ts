import { Router } from "express";
import {
  createProduct,
  listSellerProducts,
  updateSellerProduct
} from "../controllers/productsController";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected } from "../middleware/rateLimiter";
import { validateKidsCategorySelection } from "../middleware/categoryValidation";

export const sellerProductsRouter = Router();

sellerProductsRouter.post(
  "/",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  validateKidsCategorySelection,
  createProduct
);

sellerProductsRouter.get(
  "/",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  listSellerProducts
);

sellerProductsRouter.put(
  "/:id",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  validateKidsCategorySelection,
  updateSellerProduct
);

