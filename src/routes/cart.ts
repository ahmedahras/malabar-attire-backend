import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { reserveCartItem } from "../modules/reservations/reservation.controller";
import { rateLimitProtected } from "../middleware/rateLimiter";
import { getActiveCart } from "../controllers/cart.controller";

export const cartRouter = Router();

cartRouter.get("/active", requireAuth, rateLimitProtected, getActiveCart);
cartRouter.post("/reserve", requireAuth, rateLimitProtected, reserveCartItem);
