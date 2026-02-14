import sgMail from "@sendgrid/mail";
import { env } from "../../../config/env";
import { logger } from "../../../utils/logger";

const formatINR = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);

export type EmailSendResult = {
  reference: string;
  skipped?: boolean;
  reason?: "provider_disabled" | "permanent_failure" | "invalid_input";
};

export type OrderEmailBase = {
  to: string;
  orderId: string;
  amount?: number;
  courierName?: string;
  trackingId?: string;
  trackingUrl?: string | null;
};

export type RefundEmail = { to: string; orderId: string; amount: number };
export type PayoutEmail = { to: string; payoutId: string; amount: number };

export interface EmailProvider {
  sendRaw(input: { to: string; subject: string; html: string }): Promise<EmailSendResult>;
  sendOrderPlacedCustomer(input: OrderEmailBase): Promise<EmailSendResult>;
  sendOrderPlacedSeller(input: OrderEmailBase): Promise<EmailSendResult>;
  sendOrderShipped(input: OrderEmailBase): Promise<EmailSendResult>;
  sendOrderDelivered(input: OrderEmailBase): Promise<EmailSendResult>;
  sendRefundApproved(input: RefundEmail): Promise<EmailSendResult>;
  sendPayoutProcessed(input: PayoutEmail): Promise<EmailSendResult>;
}

export class RetryableEmailError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "RetryableEmailError";
    this.statusCode = statusCode;
  }
}

const isSendgridProvider = env.EMAIL_PROVIDER === "sendgrid";

if (isSendgridProvider) {
  if (!env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_FROM) {
    throw new Error("SendGrid email provider selected but EMAIL_PROVIDER_API_KEY or EMAIL_FROM is missing");
  }
  sgMail.setApiKey(env.EMAIL_PROVIDER_API_KEY);
}

const buildHtml = (lines: Array<string | null | undefined>) => {
  const content = lines.filter(Boolean).join("<br/>");
  return `<div>${content}</div>`;
};

class DefaultEmailProvider implements EmailProvider {
  async sendRaw(input: { to: string; subject: string; html: string }): Promise<EmailSendResult> {
    if (!input.to) {
      logger.warn({ subject: input.subject }, "Missing email address; skipping email send");
      return { reference: `email:skipped:${Date.now()}`, skipped: true, reason: "invalid_input" };
    }

    if (!isSendgridProvider) {
      logger.info(
        { to: input.to, subject: input.subject, provider: env.EMAIL_PROVIDER },
        "Email provider disabled; skipping email send"
      );
      return { reference: `email:skipped:${Date.now()}`, skipped: true, reason: "provider_disabled" };
    }

    try {
      const [response] = await sgMail.send({
        to: input.to,
        from: env.EMAIL_FROM as string,
        subject: input.subject,
        html: input.html
      });
      const messageId =
        response?.headers?.["x-message-id"] ||
        response?.headers?.["X-Message-Id"] ||
        response?.headers?.["x-message-id".toLowerCase()];
      return { reference: messageId ? `sendgrid:${messageId}` : `sendgrid:${Date.now()}` };
    } catch (error) {
      const sendgridError = error as {
        code?: string;
        response?: { statusCode?: number; body?: unknown };
      };
      const statusCode = sendgridError.response?.statusCode;
      const errorCode =
        sendgridError.code ?? (typeof statusCode === "number" ? String(statusCode) : "unknown_error");
      const responseBody = sendgridError.response?.body;
      logger.error(
        { provider: "sendgrid", to: input.to, subject: input.subject, errorCode, responseBody },
        "SendGrid email send failed"
      );

      if (statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500)) {
        throw new RetryableEmailError("SendGrid retryable error", statusCode);
      }

      return { reference: `email:failed:${Date.now()}`, skipped: true, reason: "permanent_failure" };
    }
  }

  async sendOrderPlacedCustomer(input: OrderEmailBase) {
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

  async sendOrderPlacedSeller(input: OrderEmailBase) {
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

  async sendOrderShipped(input: OrderEmailBase) {
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

  async sendOrderDelivered(input: OrderEmailBase) {
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

  async sendRefundApproved(input: RefundEmail) {
    const subject = `Refund processed: ${input.orderId}`;
    const html = buildHtml([
      `Your refund has been processed.`,
      `Order ID: ${input.orderId}`,
      `Status: REFUND_APPROVED`,
      `Refund Amount: ${formatINR(input.amount)}`
    ]);
    return this.sendRaw({ to: input.to, subject, html });
  }

  async sendPayoutProcessed(input: PayoutEmail) {
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

const provider: EmailProvider = new DefaultEmailProvider();

export const getEmailProvider = () => provider;

// Used by in-app notification delivery jobs (email channel)
export const sendEmailNotification = async (input: { to: string; subject: string; html: string }) => {
  return getEmailProvider().sendRaw(input);
};

// Verification checklist:
// - Place test order → check SendGrid Activity
// - Check backend logs for EMAIL_SENT
// - Confirm retry works by simulating 429
