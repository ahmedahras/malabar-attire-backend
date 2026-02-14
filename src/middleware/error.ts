import { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: err.message || "Internal server error" });
};
