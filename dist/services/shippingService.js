"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTracking = exports.schedulePickup = exports.assignCourier = exports.registerOrUpdatePickupLocation = exports.createShipment = exports.getAuthToken = void 0;
const env_1 = require("../config/env");
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
const metrics_1 = require("../utils/metrics");
const SHIPROCKET_BASE = env_1.env.SHIPROCKET_API_BASE.replace(/\/+$/g, "");
let tokenCache = null;
class ShiprocketApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.status = status;
        this.payload = payload;
    }
}
const shipmentPayloadSchema = zod_1.z.object({
    order_id: zod_1.z.string().min(1),
    order_date: zod_1.z.string().min(1),
    pickup_location: zod_1.z.string().min(1),
    billing_customer_name: zod_1.z.string().min(1),
    billing_address: zod_1.z.string().min(1),
    billing_address_2: zod_1.z.string().optional(),
    billing_city: zod_1.z.string().min(1),
    billing_pincode: zod_1.z.string().min(1),
    billing_state: zod_1.z.string().min(1),
    billing_country: zod_1.z.string().min(1),
    billing_email: zod_1.z.string().min(1),
    billing_phone: zod_1.z.string().min(1),
    shipping_is_billing: zod_1.z.boolean(),
    order_items: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1),
        sku: zod_1.z.string().min(1),
        units: zod_1.z.number().int().positive(),
        selling_price: zod_1.z.number().nonnegative()
    })),
    payment_method: zod_1.z.enum(["COD", "Prepaid"]),
    sub_total: zod_1.z.number().nonnegative(),
    length: zod_1.z.number().positive(),
    breadth: zod_1.z.number().positive(),
    height: zod_1.z.number().positive(),
    weight: zod_1.z.number().positive(),
    declared_value: zod_1.z.number().nonnegative()
});
const pickupPayloadSchema = zod_1.z.object({
    pickup_location: zod_1.z.string().trim().min(2).max(100),
    name: zod_1.z.string().trim().min(2).max(100),
    email: zod_1.z.string().trim().email(),
    phone: zod_1.z.string().trim().min(8).max(20),
    address: zod_1.z.string().trim().min(3).max(200),
    address_2: zod_1.z.string().trim().max(200).optional(),
    city: zod_1.z.string().trim().min(2).max(100),
    state: zod_1.z.string().trim().min(2).max(100),
    country: zod_1.z.string().trim().min(2).max(100),
    pin_code: zod_1.z.string().trim().min(4).max(12)
});
const parseJson = async (response) => {
    const text = await response.text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
};
const shiprocketRequest = async (path, options) => {
    const { method, body, auth = true, retryOnAuthFailure = true } = options;
    const headers = {
        "Content-Type": "application/json"
    };
    if (auth) {
        const token = await (0, exports.getAuthToken)();
        headers.Authorization = `Bearer ${token}`;
    }
    const startedAt = Date.now();
    const response = await fetch(`${SHIPROCKET_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const durationMs = Date.now() - startedAt;
    const payload = await parseJson(response);
    if (!response.ok) {
        if (auth && response.status === 401 && retryOnAuthFailure) {
            tokenCache = null;
            return shiprocketRequest(path, {
                method,
                body,
                auth,
                retryOnAuthFailure: false
            });
        }
        (0, metrics_1.incrementMetric)("shiprocket_api_failures_total");
        logger_1.logger.error({ provider: "shiprocket", status: response.status, durationMs }, "Shiprocket API request failed");
        throw new ShiprocketApiError("Shiprocket request failed", response.status, payload);
    }
    logger_1.logger.info({ provider: "shiprocket", status: response.status, durationMs }, "Shiprocket API request");
    return payload;
};
const getAuthToken = async () => {
    if (tokenCache && tokenCache.expiresAt > Date.now()) {
        return tokenCache.token;
    }
    if (!env_1.env.SHIPROCKET_EMAIL || !env_1.env.SHIPROCKET_PASSWORD) {
        throw new Error("Shiprocket credentials are missing");
    }
    const response = await shiprocketRequest("/auth/login", {
        method: "POST",
        body: {
            email: env_1.env.SHIPROCKET_EMAIL,
            password: env_1.env.SHIPROCKET_PASSWORD
        },
        auth: false
    });
    const token = response?.token;
    if (!token) {
        logger_1.logger.error({ response }, "Shiprocket auth token missing in response");
        throw new Error("Shiprocket auth failed");
    }
    const expiresInSeconds = Number(response.expires_in ?? response.expiresIn ?? 3600);
    tokenCache = {
        token,
        expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 300) * 1000
    };
    return token;
};
exports.getAuthToken = getAuthToken;
const buildShipmentPayload = (order) => {
    const address = order.shippingAddress ?? {};
    const customerName = address.fullName ?? address.name ?? order.customerName ?? "Customer";
    const customerPhone = address.phone ?? address.mobile ?? order.customerPhone ?? "";
    const customerEmail = address.email ?? order.customerEmail ?? "";
    const addressLine1 = address.addressLine1 ?? address.line1 ?? address.address ?? "";
    const addressLine2 = address.addressLine2 ?? address.line2 ?? "";
    const city = address.city ?? address.district ?? "";
    const state = address.state ?? address.region ?? "";
    const pincode = address.postalCode ?? address.pincode ?? address.zip ?? "";
    const country = address.country ?? "India";
    const weightKg = Number(order.weightKg ?? 0.5);
    const dimensions = order.dimensions ?? { length: 10, breadth: 10, height: 5 };
    if (!order.pickupLocation?.trim()) {
        throw new Error("Seller pickup location is not configured");
    }
    const payload = {
        order_id: order.orderId,
        order_date: order.orderDate,
        pickup_location: order.pickupLocation,
        billing_customer_name: customerName,
        billing_address: addressLine1,
        billing_address_2: addressLine2,
        billing_city: city,
        billing_pincode: pincode,
        billing_state: state,
        billing_country: country,
        billing_email: customerEmail,
        billing_phone: customerPhone,
        shipping_is_billing: true,
        order_items: order.items,
        payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
        sub_total: order.subtotalAmount,
        length: Number(dimensions.length ?? 10),
        breadth: Number(dimensions.breadth ?? 10),
        height: Number(dimensions.height ?? 5),
        weight: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0.5,
        declared_value: Number(order.declaredValue ?? order.subtotalAmount ?? 0)
    };
    return shipmentPayloadSchema.parse(payload);
};
const createShipment = async (order) => {
    const payload = buildShipmentPayload(order);
    const response = await shiprocketRequest("/orders/create/adhoc", { method: "POST", body: payload });
    const shiprocketOrderId = response?.order_id ?? response?.shipment_id;
    const shiprocketShipmentId = response?.shipment_id ?? response?.shipment_details?.shipment_id ?? null;
    if (!shiprocketOrderId) {
        logger_1.logger.error({ response, orderId: order.orderId }, "Shiprocket order id missing");
        throw new Error("Shiprocket order creation failed");
    }
    return {
        shiprocketOrderId: String(shiprocketOrderId),
        shiprocketShipmentId: shiprocketShipmentId ? String(shiprocketShipmentId) : null
    };
};
exports.createShipment = createShipment;
const registerOrUpdatePickupLocation = async (pickup) => {
    const payload = pickupPayloadSchema.parse({
        pickup_location: pickup.pickupName,
        name: pickup.contactName,
        email: pickup.email,
        phone: pickup.phone,
        address: pickup.addressLine1,
        address_2: pickup.addressLine2,
        city: pickup.city,
        state: pickup.state,
        country: pickup.country,
        pin_code: pickup.pincode
    });
    await shiprocketRequest("/settings/company/addpickup", {
        method: "POST",
        body: payload
    });
    return { pickupName: payload.pickup_location };
};
exports.registerOrUpdatePickupLocation = registerOrUpdatePickupLocation;
const assignCourier = async (shiprocketOrderId) => {
    const response = await shiprocketRequest("/courier/assign/awb", {
        method: "POST",
        body: { order_id: shiprocketOrderId }
    });
    return {
        awbCode: response.awb_code ?? response.awb ?? null,
        courierName: response.courier_name ?? null
    };
};
exports.assignCourier = assignCourier;
const schedulePickup = async (shiprocketOrderId) => {
    const response = await shiprocketRequest("/courier/generate/pickup", {
        method: "POST",
        body: { order_id: shiprocketOrderId }
    });
    return {
        pickupScheduledAt: response.pickup_scheduled_date ?? response.pickup_scheduled_at ?? null
    };
};
exports.schedulePickup = schedulePickup;
const fetchTracking = async (awb) => {
    const response = await shiprocketRequest(`/courier/track/awb/${encodeURIComponent(awb)}`, { method: "GET" });
    const activities = response.tracking_data?.shipment_track_activities ?? [];
    const status = response.tracking_data?.shipment_track?.[0]?.current_status ?? null;
    const courierName = response.tracking_data?.shipment_track?.[0]?.courier_name ?? null;
    return {
        status,
        courierName,
        events: activities.map((event) => ({
            status: event.activity ?? "Unknown",
            location: event.location ?? null,
            eventTime: event.date ? new Date(event.date).toISOString() : new Date().toISOString()
        }))
    };
};
exports.fetchTracking = fetchTracking;
//# sourceMappingURL=shippingService.js.map