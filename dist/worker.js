"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jobs_1 = require("./jobs");
const logger_1 = require("./utils/logger");
const shutdown = async (signal) => {
    logger_1.logger.warn({ signal }, "Worker shutdown initiated");
    const timeout = setTimeout(() => {
        logger_1.logger.error({ signal }, "Worker shutdown timeout");
        process.exit(1);
    }, 15000);
    try {
        await (0, jobs_1.stopJobSystem)();
        clearTimeout(timeout);
        logger_1.logger.info({ signal }, "Worker shutdown complete");
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error({ err: error, signal }, "Worker shutdown failed");
        process.exit(1);
    }
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
(0, jobs_1.startJobSystem)().catch((error) => {
    logger_1.logger.error({ err: error }, "Worker failed to start");
    process.exit(1);
});
//# sourceMappingURL=worker.js.map