import { env } from "../config/env";
import { z } from "zod";
import { logger } from "../utils/logger";
import { incrementMetric } from "../utils/metrics";

type ShiprocketTokenCache = {
  token: string;
  expiresAt: number;
};

type ShiprocketRequestOptions = {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  auth?: boolean;
  retryOnAuthFailure?: boolean;
};

type ShippingAddress = {
  fullName?: string;
  name?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  line1?: string;
  line2?: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  region?: string;
  postalCode?: string;
  pincode?: string;
  zip?: string;
  country?: string;
};

type ShipmentOrderItem = {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
};

type ShipmentOrder = {
  orderId: string;
  orderDate: string;
  paymentMethod: string;
  subtotalAmount: number;
  declaredValue: number;
  shippingAddress: ShippingAddress;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  items: ShipmentOrderItem[];
  pickupLocation: string;
  weightKg?: number;
  dimensions?: { length: number; breadth: number; height: number };
};

type PickupLocationInput = {
  pickupName: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

const SHIPROCKET_BASE = env.SHIPROCKET_API_BASE.replace(/\/+$/g, "");
let tokenCache: ShiprocketTokenCache | null = null;

class ShiprocketApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public payload?: unknown
  ) {
    super(message);
  }
}

const shipmentPayloadSchema = z.object({
  order_id: z.string().min(1),
  order_date: z.string().min(1),
  pickup_location: z.string().min(1),
  billing_customer_name: z.string().min(1),
  billing_address: z.string().min(1),
  billing_address_2: z.string().optional(),
  billing_city: z.string().min(1),
  billing_pincode: z.string().min(1),
  billing_state: z.string().min(1),
  billing_country: z.string().min(1),
  billing_email: z.string().min(1),
  billing_phone: z.string().min(1),
  shipping_is_billing: z.boolean(),
  order_items: z.array(
    z.object({
      name: z.string().min(1),
      sku: z.string().min(1),
      units: z.number().int().positive(),
      selling_price: z.number().nonnegative()
    })
  ),
  payment_method: z.enum(["COD", "Prepaid"]),
  sub_total: z.number().nonnegative(),
  length: z.number().positive(),
  breadth: z.number().positive(),
  height: z.number().positive(),
  weight: z.number().positive(),
  declared_value: z.number().nonnegative()
});

const pickupPayloadSchema = z.object({
  pickup_location: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8).max(20),
  address: z.string().trim().min(3).max(200),
  address_2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  pin_code: z.string().trim().min(4).max(12)
});

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const shiprocketRequest = async <T>(path: string, options: ShiprocketRequestOptions): Promise<T> => {
  const { method, body, auth = true, retryOnAuthFailure = true } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (auth) {
    const token = await getAuthToken();
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
      return shiprocketRequest<T>(path, {
        method,
        body,
        auth,
        retryOnAuthFailure: false
      });
    }

    incrementMetric("shiprocket_api_failures_total");
    logger.error(
      { provider: "shiprocket", status: response.status, durationMs },
      "Shiprocket API request failed"
    );
    throw new ShiprocketApiError("Shiprocket request failed", response.status, payload);
  }
  logger.info({ provider: "shiprocket", status: response.status, durationMs }, "Shiprocket API request");
  return payload as T;
};

export const getAuthToken = async (): Promise<string> => {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) {
    throw new Error("Shiprocket credentials are missing");
  }

  const response = await shiprocketRequest<{
    token?: string;
    expires_in?: number;
    expiresIn?: number;
  }>("/auth/login", {
    method: "POST",
    body: {
      email: env.SHIPROCKET_EMAIL,
      password: env.SHIPROCKET_PASSWORD
    },
    auth: false
  });

  const token = response?.token;
  if (!token) {
    logger.error({ response }, "Shiprocket auth token missing in response");
    throw new Error("Shiprocket auth failed");
  }
  const expiresInSeconds = Number(response.expires_in ?? response.expiresIn ?? 3600);
  tokenCache = {
    token,
    expiresAt: Date.now() + Math.max(expiresInSeconds - 60, 300) * 1000
  };
  return token;
};

const buildShipmentPayload = (order: ShipmentOrder) => {
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

export const createShipment = async (order: ShipmentOrder) => {
  const payload = buildShipmentPayload(order);
  const response = await shiprocketRequest<{
    order_id?: string | number;
    shipment_id?: string | number;
    shipment_details?: { shipment_id?: string | number };
  }>("/orders/create/adhoc", { method: "POST", body: payload });

  const shiprocketOrderId = response?.order_id ?? response?.shipment_id;
  const shiprocketShipmentId =
    response?.shipment_id ?? response?.shipment_details?.shipment_id ?? null;
  if (!shiprocketOrderId) {
    logger.error({ response, orderId: order.orderId }, "Shiprocket order id missing");
    throw new Error("Shiprocket order creation failed");
  }
  return {
    shiprocketOrderId: String(shiprocketOrderId),
    shiprocketShipmentId: shiprocketShipmentId ? String(shiprocketShipmentId) : null
  };
};

export const registerOrUpdatePickupLocation = async (pickup: PickupLocationInput) => {
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

export const assignCourier = async (shiprocketOrderId: string) => {
  const response = await shiprocketRequest<{
    awb_code?: string;
    awb?: string;
    courier_name?: string;
  }>("/courier/assign/awb", {
    method: "POST",
    body: { order_id: shiprocketOrderId }
  });

  return {
    awbCode: response.awb_code ?? response.awb ?? null,
    courierName: response.courier_name ?? null
  };
};

export const schedulePickup = async (shiprocketOrderId: string) => {
  const response = await shiprocketRequest<{
    pickup_scheduled_date?: string;
    pickup_scheduled_at?: string;
  }>("/courier/generate/pickup", {
    method: "POST",
    body: { order_id: shiprocketOrderId }
  });

  return {
    pickupScheduledAt: response.pickup_scheduled_date ?? response.pickup_scheduled_at ?? null
  };
};

export const fetchTracking = async (awb: string) => {
  const response = await shiprocketRequest<{
    tracking_data?: {
      shipment_track?: Array<{ current_status?: string; courier_name?: string }>;
      shipment_track_activities?: Array<{
        activity?: string;
        location?: string;
        date?: string;
      }>;
    };
  }>(`/courier/track/awb/${encodeURIComponent(awb)}`, { method: "GET" });

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
