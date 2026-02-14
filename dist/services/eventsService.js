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
exports.emitDomainEvent = void 0;
const pool_1 = require("../db/pool");
const types_1 = require("../jobs/types");
const env_1 = require("../config/env");
const emitDomainEvent = async (eventType, payload, client) => {
    const runner = client ?? pool_1.db;
    const { rows } = await runner.query(`INSERT INTO domain_events (event_type, payload)
     VALUES ($1, $2)
     RETURNING id`, [eventType, JSON.stringify(payload)]);
    const eventId = rows[0].id;
    if (!env_1.env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
        return eventId;
    }
    const { getEventsQueue } = await Promise.resolve().then(() => __importStar(require("../jobs/queues")));
    await getEventsQueue().add(types_1.JOBS.PROCESS_EVENT, { eventId }, {
        removeOnComplete: true,
        removeOnFail: false,
        jobId: eventId
    });
    return eventId;
};
exports.emitDomainEvent = emitDomainEvent;
//# sourceMappingURL=eventsService.js.map