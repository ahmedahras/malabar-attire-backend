"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const pool_1 = require("../db/pool");
const env_1 = require("../config/env");
exports.healthRouter = (0, express_1.Router)();
exports.healthRouter.get("/", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
});
exports.healthRouter.get("/deep", async (_req, res) => {
    try {
        await pool_1.db.query("SELECT 1");
        if (!env_1.env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
            return res.json({ status: "ok", db: "ok", redis: "disabled" });
        }
        const { getRedisConnection } = await Promise.resolve().then(() => __importStar(require("../jobs/queues")));
        const pong = await getRedisConnection().ping();
        if (pong !== "PONG") {
            return res.status(503).json({ status: "error", db: "ok", redis: "error" });
        }
        return res.json({ status: "ok", db: "ok", redis: "ok" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Health check failed";
        return res.status(503).json({ status: "error", error: message });
    }
});
exports.healthRouter.get("/db", async (_req, res) => {
    try {
        await pool_1.db.query("SELECT 1");
        res.json({ status: "ok" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        res.status(500).json({ status: "error", error: message });
    }
});
exports.healthRouter.get("/redis", async (_req, res) => {
    if (!env_1.env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
        return res.json({ status: "disabled" });
    }
    try {
        const { getRedisConnection } = await Promise.resolve().then(() => __importStar(require("../jobs/queues")));
        const pong = await getRedisConnection().ping();
        res.json({ status: pong === "PONG" ? "ok" : "error" });
    }
    catch (error) {
        res.status(503).json({ status: "error" });
    }
});
exports.healthRouter.get("/queues", async (_req, res) => {
    if (!env_1.env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
        return res.json({ status: "disabled" });
    }
    const queues = await Promise.resolve().then(() => __importStar(require("../jobs/queues")));
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
//# sourceMappingURL=health.js.map