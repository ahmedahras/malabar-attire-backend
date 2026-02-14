import { Router } from "express";
import { login, register } from "../controllers/authController";
import { rateLimitPublic } from "../middleware/rateLimiter";

export const authRouter = Router();

authRouter.post("/register", rateLimitPublic, register);
authRouter.post("/login", rateLimitPublic, login);
