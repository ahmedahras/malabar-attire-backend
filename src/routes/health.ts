import { Router } from "express";
import { db } from "../db/pool";
import { env } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

healthRouter.get("/deep", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    if (!env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
      return res.json({ status: "ok", db: "ok", redis: "disabled" });
    }
    const { getRedisConnection } = await import("../jobs/queues");
    const pong = await getRedisConnection().ping();
    if (pong !== "PONG") {
      return res.status(503).json({ status: "error", db: "ok", redis: "error" });
    }
    return res.json({ status: "ok", db: "ok", redis: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return res.status(503).json({ status: "error", error: message });
  }
});

healthRouter.get("/db", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    res.status(500).json({ status: "error", error: message });
  }
});

healthRouter.get("/redis", async (_req, res) => {
  if (!env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
    return res.json({ status: "disabled" });
  }
  try {
    const { getRedisConnection } = await import("../jobs/queues");
    const pong = await getRedisConnection().ping();
    res.json({ status: pong === "PONG" ? "ok" : "error" });
  } catch (error) {
    res.status(503).json({ status: "error" });
  }
});

healthRouter.get("/queues", async (_req, res) => {
  if (!env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
    return res.json({ status: "disabled" });
  }

  const queues = await import("../jobs/queues");
  const [automation, refunds, notifications, deadLetter, events] = await Promise.all([
    queues.getAutomationQueue().getJobCounts("wait", "active", "delayed", "failed"),
    queues.getRefundsQueue().getJobCounts("wait", "active", "delayed", "failed"),
    queues.getNotificationsQueue().getJobCounts("wait", "active", "delayed", "failed"),
    queues.getDeadLetterQueue().getJobCounts("wait", "active", "delayed", "failed"),
    queues.getEventsQueue().getJobCounts("wait", "active", "delayed", "failed")
  ]);

  res.json({
    automation: {
      ...automation,
      lag: (automation.wait ?? 0) + (automation.delayed ?? 0)
    },
    refunds: {
      ...refunds,
      lag: (refunds.wait ?? 0) + (refunds.delayed ?? 0)
    },
    notifications: {
      ...notifications,
      lag: (notifications.wait ?? 0) + (notifications.delayed ?? 0)
    },
    deadLetter: {
      ...deadLetter,
      lag: (deadLetter.wait ?? 0) + (deadLetter.delayed ?? 0)
    },
    events: {
      ...events,
      lag: (events.wait ?? 0) + (events.delayed ?? 0)
    }
  });
});
