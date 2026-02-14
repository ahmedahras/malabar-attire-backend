"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverAlert = exports.recordAlertNotification = exports.sendSlackAlert = void 0;
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
const enqueue_1 = require("../jobs/enqueue");
const logger_1 = require("../utils/logger");
const sendSlackAlert = async (message) => {
    if (!env_1.env.FINANCE_SLACK_WEBHOOK_URL) {
        return;
    }
    try {
        await fetch(env_1.env.FINANCE_SLACK_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: message })
        });
    }
    catch (error) {
        logger_1.logger.error({ err: error }, "Slack alert failed");
    }
};
exports.sendSlackAlert = sendSlackAlert;
const recordAlertNotification = async (alertId, channel) => {
    await pool_1.db.query(`INSERT INTO alert_notifications (alert_id, channel)
     VALUES ($1, $2)`, [alertId, channel]);
};
exports.recordAlertNotification = recordAlertNotification;
const deliverAlert = async (alert) => {
    const message = `[${alert.severity.toUpperCase()}] ${alert.type} - ${JSON.stringify(alert.metadata)}`;
    if (alert.severity === "critical") {
        if (env_1.env.ADMIN_FINANCE_EMAIL) {
            await (0, enqueue_1.enqueueEmail)({
                to: env_1.env.ADMIN_FINANCE_EMAIL,
                template: "finance_alert",
                data: { message }
            });
            await (0, exports.recordAlertNotification)(alert.id, "email");
        }
        if (env_1.env.FINANCE_SLACK_WEBHOOK_URL) {
            await (0, exports.sendSlackAlert)(message);
            await (0, exports.recordAlertNotification)(alert.id, "slack");
        }
    }
};
exports.deliverAlert = deliverAlert;
//# sourceMappingURL=alertDeliveryService.js.map