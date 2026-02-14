"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logFailedJob = exports.logJobResult = void 0;
const pool_1 = require("../db/pool");
const logJobResult = async (input) => {
    await pool_1.db.query(`INSERT INTO job_logs
     (queue_name, job_name, status, attempts, duration_ms, error_message, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        input.queueName,
        input.jobName,
        input.status,
        input.attempts,
        input.durationMs ?? null,
        input.errorMessage ?? null,
        input.payload ? JSON.stringify(input.payload) : null
    ]);
};
exports.logJobResult = logJobResult;
const logFailedJob = async (input) => {
    await pool_1.db.query(`INSERT INTO failed_jobs
     (queue_name, job_name, attempts, error_message, payload)
     VALUES ($1, $2, $3, $4, $5)`, [
        input.queueName,
        input.jobName,
        input.attempts,
        input.errorMessage,
        input.payload ? JSON.stringify(input.payload) : null
    ]);
};
exports.logFailedJob = logFailedJob;
//# sourceMappingURL=logger.js.map