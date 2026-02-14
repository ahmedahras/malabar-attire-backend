import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { db } from "../db/pool";

export type AuthPayload = {
  sub: string;
  role: "customer" | "shop_owner" | "admin";
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

export const requireRole = (...roles: AuthPayload["role"][]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Missing token" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
};

export const requireShopContext = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const shopIdHeader = req.headers["x-shop-id"];
  const shopId = Array.isArray(shopIdHeader) ? shopIdHeader[0] : shopIdHeader;
  if (!shopId || typeof shopId !== "string") {
    return res.status(400).json({ error: "Missing shop context" });
  }

  try {
    const { rows } = await db.query(
      `SELECT id FROM shops WHERE id = $1 AND owner_user_id = $2`,
      [shopId, req.user.sub]
    );

    if (!rows[0]) {
      return res.status(403).json({ error: "Invalid shop ownership" });
    }

    req.shopId = shopId;
    return next();
  } catch (error) {
    return next(error);
  }
};
