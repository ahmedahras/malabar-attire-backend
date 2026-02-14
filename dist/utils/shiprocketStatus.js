"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeShiprocketStatus = void 0;
const normalizeShiprocketStatus = (value) => {
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
exports.normalizeShiprocketStatus = normalizeShiprocketStatus;
//# sourceMappingURL=shiprocketStatus.js.map