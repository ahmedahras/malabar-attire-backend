"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnreadCount = exports.markAllNotificationsRead = exports.markNotificationRead = exports.listNotifications = exports.createNotification = void 0;
const pool_1 = require("../../db/pool");
const enqueue_1 = require("../../jobs/enqueue");
const notificationPreferences_service_1 = require("./notificationPreferences.service");
const cache_1 = require("../../utils/cache");
const createNotification = async (input) => {
    const runner = input.client ?? pool_1.db;
    const nowResult = await runner.query(`SELECT NOW() AS now`);
    const now = nowResult.rows[0]?.now;
    const { rows } = await runner.query(`INSERT INTO notifications (user_id, type, title, message, metadata, batch_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`, [
        input.userId,
        input.type,
        input.title,
        input.message,
        JSON.stringify(input.metadata ?? {}),
        input.batchKey ?? null
    ]);
    const notificationId = rows[0]?.id;
    if (!notificationId) {
        return;
    }
    await (0, cache_1.invalidatePattern)(`cache:notifications:${input.userId}:*`);
    const { rows: userRows } = await runner.query(`SELECT email FROM users WHERE id = $1`, [input.userId]);
    const email = userRows[0]?.email;
    const prefs = await (0, notificationPreferences_service_1.getPreferences)(input.userId);
    const deliveryIds = [];
    let rateLimited = false;
    if (!input.bypassRateLimit) {
        const { rows: rateRows } = await runner.query(`SELECT window_start, count
       FROM notification_rate_limits
       WHERE user_id = $1 AND type = $2
       FOR UPDATE`, [input.userId, input.type]);
        const windowStart = rateRows[0]?.window_start;
        const currentCount = Number(rateRows[0]?.count ?? 0);
        const windowExpired = windowStart
            ? new Date(windowStart).getTime() < Date.now() - 5 * 60 * 1000
            : true;
        if (rateRows[0] && !windowExpired) {
            const nextCount = currentCount + 1;
            await runner.query(`UPDATE notification_rate_limits
         SET count = $3
         WHERE user_id = $1 AND type = $2`, [input.userId, input.type, nextCount]);
            rateLimited = nextCount > 5;
        }
        else if (rateRows[0]) {
            await runner.query(`UPDATE notification_rate_limits
         SET count = 1, window_start = $3
         WHERE user_id = $1 AND type = $2`, [input.userId, input.type, now]);
        }
        else {
            await runner.query(`INSERT INTO notification_rate_limits (user_id, type, window_start, count)
         VALUES ($1, $2, $3, 1)`, [input.userId, input.type, now]);
        }
    }
    if (rateLimited) {
        return;
    }
    if (email && (0, notificationPreferences_service_1.shouldDeliver)(prefs, "email", input.type)) {
        const { rows: deliveryRows } = await runner.query(`INSERT INTO notification_deliveries (notification_id, user_id, channel, status)
       VALUES ($1, $2, 'email', 'PENDING')
       RETURNING id`, [notificationId, input.userId]);
        if (deliveryRows[0]?.id) {
            deliveryIds.push(deliveryRows[0].id);
        }
    }
    if (input.metadata?.pushToken && (0, notificationPreferences_service_1.shouldDeliver)(prefs, "push", input.type)) {
        const { rows: deliveryRows } = await runner.query(`INSERT INTO notification_deliveries (notification_id, user_id, channel, status)
       VALUES ($1, $2, 'push', 'PENDING')
       RETURNING id`, [notificationId, input.userId]);
        if (deliveryRows[0]?.id) {
            deliveryIds.push(deliveryRows[0].id);
        }
    }
    const delayMs = input.batchKey ? 60 * 1000 : 0;
    for (const deliveryId of deliveryIds) {
        await (0, enqueue_1.enqueueNotificationDelivery)(deliveryId, { delayMs });
    }
};
exports.createNotification = createNotification;
const listNotifications = async (input) => {
    const where = ["user_id = $1"];
    const params = [input.userId];
    if (input.type) {
        params.push(input.type);
        where.push(`type = $${params.length}`);
    }
    if (input.startDate) {
        params.push(input.startDate);
        where.push(`created_at >= $${params.length}`);
    }
    if (input.endDate) {
        params.push(input.endDate);
        where.push(`created_at <= $${params.length}`);
    }
    params.push(input.limit);
    params.push(input.offset);
    const { rows } = await pool_1.db.query(`SELECT id, type, title, message, metadata, is_read, created_at
     FROM notifications
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return rows;
};
exports.listNotifications = listNotifications;
const markNotificationRead = async (userId, id) => {
    const { rows } = await pool_1.db.query(`UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING id`, [id, userId]);
    return rows[0] ?? null;
};
exports.markNotificationRead = markNotificationRead;
const markAllNotificationsRead = async (userId) => {
    const { rowCount } = await pool_1.db.query(`UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE`, [userId]);
    return { updated: rowCount ?? 0 };
};
exports.markAllNotificationsRead = markAllNotificationsRead;
const getUnreadCount = async (userId) => {
    const { rows } = await pool_1.db.query(`SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`, [userId]);
    return Number(rows[0]?.count ?? 0);
};
exports.getUnreadCount = getUnreadCount;
//# sourceMappingURL=notification.service.js.map