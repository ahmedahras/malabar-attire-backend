export type NormalizedShipmentStatus =
  | "DELIVERED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "RTO_DELIVERED"
  | "CANCELLED"
  | "PROCESSING";

export const normalizeShiprocketStatus = (value: string): NormalizedShipmentStatus => {
  const raw = value.trim().toLowerCase();

  if (raw.includes("rto") && raw.includes("delivered")) {
    return "RTO_DELIVERED";
  }
  if (raw.includes("out for delivery")) {
    return "OUT_FOR_DELIVERY";
  }
  if (raw.includes("in transit")) {
    return "IN_TRANSIT";
  }
  if (raw.includes("delivered")) {
    return "DELIVERED";
  }
  if (raw.includes("cancelled") || raw.includes("canceled")) {
    return "CANCELLED";
  }
  return "PROCESSING";
};

