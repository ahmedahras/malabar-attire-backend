"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldDeliver = exports.updatePreferences = exports.getPreferences = void 0;
const pool_1 = require("../../db/pool");
const normalizeRow = (row) => ({
    userId: row.user_id,
    emailEnabled: Boolean(row.email_enabled),
    pushEnabled: Boolean(row.push_enabled),
    inAppEnabled: Boolean(row.in_app_enabled),
    mutedTypes: Array.isArray(row.muted_types) ? row.muted_types : []
});
const getPreferences = async (userId) => {
    const { rows } = await pool_1.db.query(`SELECT user_id, email_enabled, push_enabled, in_app_enabled, muted_types
     FROM notification_preferences
     WHERE user_id = $1`, [userId]);
    if (!rows[0]) {
        const { rows: created } = await pool_1.db.query(`INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       RETURNING user_id, email_enabled, push_enabled, in_app_enabled, muted_types`, [userId]);
        return normalizeRow(created[0]);
    }
    return normalizeRow(rows[0]);
};
exports.getPreferences = getPreferences;
const updatePreferences = async (userId, input) => {
    const { rows } = await pool_1.db.query(`INSERT INTO notification_preferences
     (user_id, email_enabled, push_enabled, in_app_enabled, muted_types)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
     SET email_enabled = COALESCE(EXCLUDED.email_enabled, notification_preferences.email_enabled),
         push_enabled = COALESCE(EXCLUDED.push_enabled, notification_preferences.push_enabled),
         in_app_enabled = COALESCE(EXCLUDED.in_app_enabled, notification_preferences.in_app_enabled),
         muted_types = COALESCE(EXCLUDED.muted_types, notification_preferences.muted_types),
         updated_at = NOW()
     RETURNING user_id, email_enabled, push_enabled, in_app_enabled, muted_types`, [
        userId,
        input.emailEnabled ?? null,
        input.pushEnabled ?? null,
        input.inAppEnabled ?? null,
        input.mutedTypes ? JSON.stringify(input.mutedTypes) : null
    ]);
    return normalizeRow(rows[0]);
};
exports.updatePreferences = updatePreferences;
const shouldDeliver = (prefs, channel, type) => {
    if (prefs.mutedTypes.includes(type)) {
        return false;
    }
    if (channel === "email") {
        return prefs.emailEnabled;
    }
    if (channel === "push") {
        return prefs.pushEnabled;
    }
    return false;
};
exports.shouldDeliver = shouldDeliver;
//# sourceMappingURL=notificationPreferences.service.js.map