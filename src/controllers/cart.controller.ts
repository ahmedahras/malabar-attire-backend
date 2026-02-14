import { Request, Response } from "express";
import { getActiveCartForUser } from "../services/cart.service";

export const getActiveCart = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }

  const cart = await getActiveCartForUser(req.user.sub);
  return res.json(cart);
};
