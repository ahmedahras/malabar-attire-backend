import { Router } from "express";
import {
  createProduct,
  getProductById,
  getProductVariants,
  getSimilarProducts,
  listProductCategories,
  listProducts
} from "../controllers/productsController";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected, rateLimitPublic } from "../middleware/rateLimiter";
import { validateKidsCategorySelection } from "../middleware/categoryValidation";

export const productsRouter = Router();

productsRouter.post(
  "/",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  validateKidsCategorySelection,
  createProduct
);
productsRouter.get("/categories", rateLimitPublic, listProductCategories);
productsRouter.get("/", rateLimitPublic, listProducts);
productsRouter.get("/:id", rateLimitPublic, getProductById);
productsRouter.get("/:id/variants", rateLimitPublic, getProductVariants);
productsRouter.get("/:id/similar", rateLimitPublic, getSimilarProducts);
