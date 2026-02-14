import { Request, Response } from "express";
import { z } from "zod";
import { keysToCamel } from "../../utils/case";
import { getCache, invalidatePattern, setCache } from "../../utils/cache";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "./notification.service";
import {
  getPreferences,
  updatePreferences
} from "./notificationPreferences.service";

const listSchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
  type: z.string().min(1).max(80).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

const idSchema = z.object({
  id: z.string().uuid()
});

const buildCacheKey = (base: string, query: Record<string, unknown>) => {
  const entries = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${base}:${JSON.stringify(entries)}`;
};

export const getNotifications = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const query = listSchema.parse(req.query);
  const cacheKey = buildCacheKey(`cache:notifications:${req.user.sub}`, {
    limit: query.limit,
    offset: query.offset,
    type: query.type,
    startDate: query.startDate,
    endDate: query.endDate
  });
  const cached = await getCache<{ items: Array<Record<string, unknown>> }>(cacheKey);
  if (cached) {
    return res.json(cached);
  }
  const rows = await listNotifications({
    userId: req.user.sub,
    limit: query.limit,
    offset: query.offset,
    type: query.type,
    startDate: query.startDate,
    endDate: query.endDate
  });
  const response = { items: rows.map((row) => keysToCamel(row)) };
  await setCache(cacheKey, response, 30);
  return res.json(response);
};

export const markRead = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const params = idSchema.parse(req.params);
  const updated = await markNotificationRead(req.user.sub, params.id);
  if (!updated) {
    return res.status(404).json({ error: "Notification not found" });
  }
  await invalidatePattern(`cache:notifications:${req.user.sub}:*`);
  return res.json({ success: true, id: params.id });
};

export const markAllRead = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const result = await markAllNotificationsRead(req.user.sub);
  await invalidatePattern(`cache:notifications:${req.user.sub}:*`);
  return res.json({ success: true, updated: result.updated });
};

export const getUnreadCountHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const count = await getUnreadCount(req.user.sub);
  return res.json({ count });
};

const preferencesSchema = z.object({
  emailEnabled: z.coerce.boolean().optional(),
  pushEnabled: z.coerce.boolean().optional(),
  inAppEnabled: z.coerce.boolean().optional(),
  mutedTypes: z.array(z.string().min(1)).optional()
});

export const getPreferencesHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const prefs = await getPreferences(req.user.sub);
  return res.json({ preferences: keysToCamel(prefs) });
};

export const updatePreferencesHandler = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: "Missing token" });
  }
  const body = preferencesSchema.parse(req.body ?? {});
  const prefs = await updatePreferences(req.user.sub, body);
  return res.json({ preferences: keysToCamel(prefs) });
};
