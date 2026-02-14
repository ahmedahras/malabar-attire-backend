import { NextFunction, Request, Response } from "express";
import { db } from "../db/pool";
import { allowedTransitions, getReturnRequest, ReturnStatus } from "../services/returnsService";

export const requireDeliveredOrderForReturn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: "Missing orderId" });
  }

  const { rows } = await db.query(
    `SELECT status FROM orders WHERE id = $1`,
    [orderId]
  );

  if (!rows[0]) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (rows[0].status !== "DELIVERED") {
    return res.status(409).json({ error: "Return allowed only for delivered orders" });
  }

  return next();
};

export const validateReturnTransition = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const returnId = String(req.params.id);
  const nextStatus = req.body?.status as ReturnStatus | undefined;

  if (!returnId) {
    return res.status(400).json({ error: "Missing return id" });
  }
  if (!nextStatus) {
    return res.status(400).json({ error: "Missing status" });
  }

  const returnRequest = await getReturnRequest(returnId);
  if (!returnRequest) {
    return res.status(404).json({ error: "Return not found" });
  }

  const currentStatus = returnRequest.status as ReturnStatus;
  const allowed = allowedTransitions[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    return res.status(409).json({ error: "Invalid state transition" });
  }

  if (nextStatus === "SELLER_REVIEW" && !returnRequest.video_proof_url) {
    return res.status(409).json({ error: "Video proof required for seller review" });
  }

  req.returnRequest = returnRequest;
  return next();
};

export const validateRefundEligibility = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const returnId = String(req.params.id);
  if (!returnId) {
    return res.status(400).json({ error: "Missing return id" });
  }

  const returnRequest = await getReturnRequest(returnId);
  if (!returnRequest) {
    return res.status(404).json({ error: "Return not found" });
  }

  if (returnRequest.status !== "RECEIVED_BY_SELLER") {
    return res
      .status(409)
      .json({ error: "Refund allowed only after seller receives the item" });
  }

  if (returnRequest.seller_decision !== "APPROVED") {
    return res.status(409).json({ error: "Refund requires seller approval" });
  }

  req.returnRequest = returnRequest;
  return next();
};
