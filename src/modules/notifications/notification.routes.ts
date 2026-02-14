import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { rateLimitProtected } from "../../middleware/rateLimiter";
import {
  getNotifications,
  getUnreadCountHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
  markAllRead,
  markRead
} from "./notification.controller";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, rateLimitProtected, getNotifications);
notificationsRouter.get("/unread-count", requireAuth, rateLimitProtected, getUnreadCountHandler);
notificationsRouter.get("/preferences", requireAuth, rateLimitProtected, getPreferencesHandler);
notificationsRouter.patch("/:id/read", requireAuth, rateLimitProtected, markRead);
notificationsRouter.patch("/mark-all-read", requireAuth, rateLimitProtected, markAllRead);
notificationsRouter.patch("/preferences", requireAuth, rateLimitProtected, updatePreferencesHandler);
