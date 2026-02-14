"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFoundHandler = void 0;
const logger_1 = require("../utils/logger");
const notFoundHandler = (_req, res) => {
    res.status(404).json({ error: "Route not found" });
};
exports.notFoundHandler = notFoundHandler;
const errorHandler = (err, _req, res, _next) => {
    logger_1.logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: err.message || "Internal server error" });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.js.map