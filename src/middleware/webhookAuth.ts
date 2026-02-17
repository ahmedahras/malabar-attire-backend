import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

const pickHeaderValue = (value: string | string[] | undefined) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find((part) => typeof part === "string" && part.trim().length > 0);
    return first?.trim() ?? "";
  }
  return "";
};

export const requireShiprocketWebhookKey = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const configuredSecret = (env.SHIPROCKET_WEBHOOK_SECRET ?? "").trim();
  const token = pickHeaderValue(req.headers["x-api-key"]);

  if (!configuredSecret || !token || token !== configuredSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
};

