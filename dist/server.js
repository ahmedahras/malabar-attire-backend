"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const env_1 = require("./config/env");
const jobs_1 = require("./jobs");
const logger_1 = require("./utils/logger");
const pool_1 = require("./db/pool");
const app = (0, app_1.createApp)();
let server = null;
const startServer = async () => {
    logger_1.logger.info({ pid: process.pid, port: env_1.env.PORT }, "Server starting");
    logger_1.logger.info("DB CONNECT ATTEMPT");
    try {
        const client = await pool_1.db.connect();
        client.release();
        logger_1.logger.info("DB CONNECTED");
    }
    catch (error) {
        logger_1.logger.error({ err: error }, "DB CONNECT FAILED");
        process.exit(1);
    }
    server = app.listen(env_1.env.PORT, () => {
        logger_1.logger.info({ port: env_1.env.PORT }, "API listening");
    });
    (0, jobs_1.startJobSystem)().catch((error) => {
        logger_1.logger.error({ err: error }, "Job system failed to start");
    });
};
const shutdown = async (signal) => {
    logger_1.logger.warn({ signal }, "Graceful shutdown initiated");
    const timeout = setTimeout(() => {
        logger_1.logger.error({ signal }, "Graceful shutdown timeout");
        process.exit(1);
    }, 15000);
    try {
        if (server) {
            await new Promise((resolve) => server?.close(() => resolve()));
        }
        await (0, jobs_1.stopJobSystem)();
        await pool_1.db.end();
        clearTimeout(timeout);
        logger_1.logger.info({ signal }, "Graceful shutdown complete");
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error({ err: error, signal }, "Graceful shutdown failed");
        process.exit(1);
    }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
startServer();
//# sourceMappingURL=server.js.map