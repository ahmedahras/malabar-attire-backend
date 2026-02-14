import { db } from "../db/pool";
import { env } from "../config/env";
import { enqueueEmail } from "../jobs/enqueue";
import { logger } from "../utils/logger";

export const sendSlackAlert = async (message: string) => {
  if (!env.FINANCE_SLACK_WEBHOOK_URL) {
    return;
  }
  try {
    await fetch(env.FINANCE_SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message })
    });
  } catch (error) {
    logger.error({ err: error }, "Slack alert failed");
  }
};

export const recordAlertNotification = async (alertId: string, channel: string) => {
  await db.query(
    `INSERT INTO alert_notifications (alert_id, channel)
     VALUES ($1, $2)`,
    [alertId, channel]
  );
};

export const deliverAlert = async (alert: {
  id: string;
  type: string;
  severity: string;
  metadata: Record<string, unknown>;
}) => {
  const message = `[${alert.severity.toUpperCase()}] ${alert.type} - ${JSON.stringify(
    alert.metadata
  )}`;

  if (alert.severity === "critical") {
    if (env.ADMIN_FINANCE_EMAIL) {
      await enqueueEmail({
        to: env.ADMIN_FINANCE_EMAIL,
        template: "finance_alert",
        data: { message }
      });
      await recordAlertNotification(alert.id, "email");
    }

    if (env.FINANCE_SLACK_WEBHOOK_URL) {
      await sendSlackAlert(message);
      await recordAlertNotification(alert.id, "slack");
    }
  }
};
