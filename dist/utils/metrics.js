"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMetrics = exports.incrementMetric = void 0;
const counters = {
    webhook_failures_total: 0,
    email_sent_total: 0,
    email_failed_total: 0,
    email_retry_total: 0,
    shiprocket_api_failures_total: 0
};
// TODO(alert): Payment captured but order not PAID.
// TODO(alert): Shipment created but no tracking events in 12h.
// TODO(alert): Repeated webhook signature failures.
// TODO(alert): Queue depth > threshold.
const incrementMetric = (key, value = 1) => {
    counters[key] = (counters[key] ?? 0) + value;
};
exports.incrementMetric = incrementMetric;
const getMetrics = () => {
    return { ...counters };
};
exports.getMetrics = getMetrics;
//# sourceMappingURL=metrics.js.map