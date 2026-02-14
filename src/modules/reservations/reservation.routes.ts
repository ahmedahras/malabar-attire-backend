import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { convertReservationHandler } from "./reservation.controller";
import { rateLimitProtected } from "../../middleware/rateLimiter";

export const reservationsRouter = Router();

reservationsRouter.post("/convert", requireAuth, rateLimitProtected, convertReservationHandler);
