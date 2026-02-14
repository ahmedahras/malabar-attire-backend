"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackingUrl = buildTrackingUrl;
const COURIER_TRACKING_TEMPLATES = {
    DTDC: "https://www.dtdc.in/tracking/tracking_results.asp?strCnno={tracking_id}",
    Delhivery: "https://www.delhivery.com/track/package/{tracking_id}",
    "India Post": "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consignmentid={tracking_id}",
    BlueDart: "https://www.bluedart.com/tracking?trackingNo={tracking_id}"
};
function buildTrackingUrl(courierName, trackingId) {
    const template = COURIER_TRACKING_TEMPLATES[courierName];
    const encoded = encodeURIComponent(trackingId.trim());
    return template.replace("{tracking_id}", encoded);
}
//# sourceMappingURL=shippingTracking.js.map