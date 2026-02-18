import { Router } from "express";
import { createUploadPresign, createReadPresign, serveProductImage } from "../controllers/uploadsController";
import { requireAuth, requireRole } from "../middleware/auth";
import { rateLimitProtected, rateLimitPublic } from "../middleware/rateLimiter";

export const uploadsRouter = Router();

// Sellers upload product images — returns a presigned PUT URL + stored key
uploadsRouter.post(
  "/presign",
  requireAuth,
  rateLimitProtected,
  requireRole("shop_owner"),
  createUploadPresign
);

// Anyone authenticated can obtain a signed read URL for a private S3 key
uploadsRouter.post(
  "/sign-read",
  requireAuth,
  rateLimitProtected,
  createReadPresign
);

// Public — serves a product image by key via a signed S3 redirect (no auth required)
uploadsRouter.get(
  "/product-image",
  rateLimitPublic,
  serveProductImage
);
