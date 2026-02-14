"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailNotification = exports.getEmailProvider = exports.RetryableEmailError = void 0;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const env_1 = require("../../../config/env");
const logger_1 = require("../../../utils/logger");
const formatINR = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
class RetryableEmailError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "RetryableEmailError";
        this.statusCode = statusCode;
    }
}
exports.RetryableEmailError = RetryableEmailError;
const isSendgridProvider = env_1.env.EMAIL_PROVIDER === "sendgrid";
if (isSendgridProvider) {
    if (!env_1.env.EMAIL_PROVIDER_API_KEY || !env_1.env.EMAIL_FROM) {
        throw new Error("SendGrid email provider selected but EMAIL_PROVIDER_API_KEY or EMAIL_FROM is missing");
    }
    mail_1.default.setApiKey(env_1.env.EMAIL_PROVIDER_API_KEY);
}
const buildHtml = (lines) => {
    const content = lines.filter(Boolean).join("<br/>");
    return `<div>${content}</div>`;
};
class DefaultEmailProvider {
    async sendRaw(input) {
        if (!input.to) {
            logger_1.logger.warn({ subject: input.subject }, "Missing email address; skipping email send");
            return { reference: `email:skipped:${Date.now()}`, skipped: true, reason: "invalid_input" };
        }
        if (!isSendgridProvider) {
            logger_1.logger.info({ to: input.to, subject: input.subject, provider: env_1.env.EMAIL_PROVIDER }, "Email provider disabled; skipping email send");
            return { reference: `email:skipped:${Date.now()}`, skipped: true, reason: "provider_disabled" };
        }
        try {
            const [response] = await mail_1.default.send({
                to: input.to,
                from: env_1.env.EMAIL_FROM,
                subject: input.subject,
                html: input.html
            });
            const messageId = response?.headers?.["x-message-id"] ||
                response?.headers?.["X-Message-Id"] ||
                response?.headers?.["x-message-id".toLowerCase()];
            return { reference: messageId ? `sendgrid:${messageId}` : `sendgrid:${Date.now()}` };
        }
        catch (error) {
            const sendgridError = error;
            const statusCode = sendgridError.response?.statusCode;
            const errorCode = sendgridError.code ?? (typeof statusCode === "number" ? String(statusCode) : "unknown_error");
            const responseBody = sendgridError.response?.body;
            logger_1.logger.error({ provider: "sendgrid", to: input.to, subject: input.subject, errorCode, responseBody }, "SendGrid email send failed");
            if (statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500)) {
                throw new RetryableEmailError("SendGrid retryable error", statusCode);
            }
            return { reference: `email:failed:${Date.now()}`, skipped: true, reason: "permanent_failure" };
        }
    }
    async sendOrderPlacedCustomer(input) {
        const subject = `Order placed: ${input.orderId}`;
        const html = buildHtml([
            `Your order has been placed.`,
            `Order ID: ${input.orderId}`,
            `Status: PLACED`,
            input.amount !== undefined ? `Amount: ${formatINR(input.amount)}` : null
        ]
            .filter(Boolean));
        return this.sendRaw({ to: input.to, subject, html });
    }
    async sendOrderPlacedSeller(input) {
        const subject = `New order received: ${input.orderId}`;
        const html = buildHtml([
            `You have received a new order.`,
            `Order ID: ${input.orderId}`,
            `Status: PLACED`,
            input.amount !== undefined ? `Amount: ${formatINR(input.amount)}` : null
        ]
            .filter(Boolean));
        return this.sendRaw({ to: input.to, subject, html });
    }
    async sendOrderShipped(input) {
        const subject = `Order shipped: ${input.orderId}`;
        const html = buildHtml([
            `Good news — your order has been shipped.`,
            `Order ID: ${input.orderId}`,
            `Status: SHIPPED`,
            input.amount !== undefined ? `Amount: ${formatINR(input.amount)}` : null,
            input.courierName ? `Courier: ${input.courierName}` : null,
            input.trackingId ? `Tracking ID: ${input.trackingId}` : null,
            input.trackingUrl ? `Tracking URL: ${input.trackingUrl}` : null
        ]
            .filter(Boolean));
        return this.sendRaw({ to: input.to, subject, html });
    }
    async sendOrderDelivered(input) {
        const subject = `Order delivered: ${input.orderId}`;
        const html = buildHtml([
            `Your order has been delivered.`,
            `Order ID: ${input.orderId}`,
            `Status: DELIVERED`,
            input.amount !== undefined ? `Amount: ${formatINR(input.amount)}` : null,
            input.courierName ? `Courier: ${input.courierName}` : null,
            input.trackingId ? `Tracking ID: ${input.trackingId}` : null,
            input.trackingUrl ? `Tracking URL: ${input.trackingUrl}` : null
        ]
            .filter(Boolean));
        return this.sendRaw({ to: input.to, subject, html });
    }
    async sendRefundApproved(input) {
        const subject = `Refund processed: ${input.orderId}`;
        const html = buildHtml([
            `Your refund has been processed.`,
            `Order ID: ${input.orderId}`,
            `Status: REFUND_APPROVED`,
            `Refund Amount: ${formatINR(input.amount)}`
        ]);
        return this.sendRaw({ to: input.to, subject, html });
    }
    async sendPayoutProcessed(input) {
        const subject = `Payout processed: ${input.payoutId}`;
        const html = buildHtml([
            `Your payout has been processed.`,
            `Payout ID: ${input.payoutId}`,
            `Status: PAYOUT_PROCESSED`,
            `Amount: ${formatINR(input.amount)}`
        ]);
        return this.sendRaw({ to: input.to, subject, html });
    }
}
const provider = new DefaultEmailProvider();
const getEmailProvider = () => provider;
exports.getEmailProvider = getEmailProvider;
// Used by in-app notification delivery jobs (email channel)
const sendEmailNotification = async (input) => {
    return (0, exports.getEmailProvider)().sendRaw(input);
};
exports.sendEmailNotification = sendEmailNotification;
// Verification checklist:
// - Place test order → check SendGrid Activity
// - Check backend logs for EMAIL_SENT
// - Confirm retry works by simulating 429
//# sourceMappingURL=email.provider.js.map