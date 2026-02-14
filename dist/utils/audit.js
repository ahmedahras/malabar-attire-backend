"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = void 0;
const pool_1 = require("../db/pool");
const logAudit = async (input) => {
    const runner = input.client ?? pool_1.db;
    await runner.query(`INSERT INTO audit_logs
     (entity_type, entity_id, action, from_state, to_state, actor_type, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
        input.entityType,
        input.entityId,
        input.action,
        input.fromState ?? null,
        input.toState ?? null,
        input.actorType,
        input.actorId ?? null,
        JSON.stringify(input.metadata ?? {})
    ]);
};
exports.logAudit = logAudit;
//# sourceMappingURL=audit.js.map