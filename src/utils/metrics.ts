type MetricKey =
  | "webhook_failures_total"
  | "email_sent_total"
  | "email_failed_total"
  | "email_retry_total"
  | "shiprocket_api_failures_total";

const counters: Record<MetricKey, number> = {
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

export const incrementMetric = (key: MetricKey, value = 1) => {
  counters[key] = (counters[key] ?? 0) + value;
};

export const getMetrics = () => {
  return { ...counters };
};
