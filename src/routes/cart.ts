import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { reserveCartItem } from "../modules/reservations/reservation.controller";
import { getActiveCart } from "../controllers/cart.controller";

export const cartRouter = Router();

cartRouter.get("/active", requireAuth, getActiveCart);
cartRouter.post("/reserve", requireAuth, reserveCartItem);
