"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePreferencesHandler = exports.getPreferencesHandler = exports.getUnreadCountHandler = exports.markAllRead = exports.markRead = exports.getNotifications = void 0;
const zod_1 = require("zod");
const case_1 = require("../../utils/case");
const cache_1 = require("../../utils/cache");
const notification_service_1 = require("./notification.service");
const notificationPreferences_service_1 = require("./notificationPreferences.service");
const listSchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().positive().max(50).default(10),
    offset: zod_1.z.coerce.number().int().nonnegative().default(0),
    type: zod_1.z.string().min(1).max(80).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional()
});
const idSchema = zod_1.z.object({
    id: zod_1.z.string().uuid()
});
const buildCacheKey = (base, query) => {
    const entries = Object.entries(query)
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));
    return `${base}:${JSON.stringify(entries)}`;
};
const getNotifications = async (req, res) => {
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
    const cached = await (0, cache_1.getCache)(cacheKey);
    if (cached) {
        return res.json(cached);
    }
    const rows = await (0, notification_service_1.listNotifications)({
        userId: req.user.sub,
        limit: query.limit,
        offset: query.offset,
        type: query.type,
        startDate: query.startDate,
        endDate: query.endDate
    });
    const response = { items: rows.map((row) => (0, case_1.keysToCamel)(row)) };
    await (0, cache_1.setCache)(cacheKey, response, 30);
    return res.json(response);
};
exports.getNotifications = getNotifications;
const markRead = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const params = idSchema.parse(req.params);
    const updated = await (0, notification_service_1.markNotificationRead)(req.user.sub, params.id);
    if (!updated) {
        return res.status(404).json({ error: "Notification not found" });
    }
    await (0, cache_1.invalidatePattern)(`cache:notifications:${req.user.sub}:*`);
    return res.json({ success: true, id: params.id });
};
exports.markRead = markRead;
const markAllRead = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const result = await (0, notification_service_1.markAllNotificationsRead)(req.user.sub);
    await (0, cache_1.invalidatePattern)(`cache:notifications:${req.user.sub}:*`);
    return res.json({ success: true, updated: result.updated });
};
exports.markAllRead = markAllRead;
const getUnreadCountHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const count = await (0, notification_service_1.getUnreadCount)(req.user.sub);
    return res.json({ count });
};
exports.getUnreadCountHandler = getUnreadCountHandler;
const preferencesSchema = zod_1.z.object({
    emailEnabled: zod_1.z.coerce.boolean().optional(),
    pushEnabled: zod_1.z.coerce.boolean().optional(),
    inAppEnabled: zod_1.z.coerce.boolean().optional(),
    mutedTypes: zod_1.z.array(zod_1.z.string().min(1)).optional()
});
const getPreferencesHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const prefs = await (0, notificationPreferences_service_1.getPreferences)(req.user.sub);
    return res.json({ preferences: (0, case_1.keysToCamel)(prefs) });
};
exports.getPreferencesHandler = getPreferencesHandler;
const updatePreferencesHandler = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const body = preferencesSchema.parse(req.body ?? {});
    const prefs = await (0, notificationPreferences_service_1.updatePreferences)(req.user.sub, body);
    return res.json({ preferences: (0, case_1.keysToCamel)(prefs) });
};
exports.updatePreferencesHandler = updatePreferencesHandler;
//# sourceMappingURL=notification.controller.js.map