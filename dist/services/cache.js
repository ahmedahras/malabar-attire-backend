"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheClient = void 0;
const redis_1 = require("redis");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.cacheClient = (0, redis_1.createClient)({
    url: env_1.env.REDIS_URL
});
exports.cacheClient.on("error", (err) => {
    logger_1.logger.error({ err }, "Redis error");
});
//# sourceMappingURL=cache.js.map