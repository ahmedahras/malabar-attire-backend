"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
exports.db = new pg_1.Pool({
    connectionString: env_1.env.DATABASE_URL,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000
});
exports.db.on("error", (error) => {
    logger_1.logger.error({ err: error }, "DB pool error");
});
//# sourceMappingURL=pool.js.map