export type CourierName = "DTDC" | "Delhivery" | "India Post" | "BlueDart";

const COURIER_TRACKING_TEMPLATES: Record<CourierName, string> = {
  DTDC: "https://www.dtdc.in/tracking/tracking_results.asp?strCnno={tracking_id}",
  Delhivery: "https://www.delhivery.com/track/package/{tracking_id}",
  "India Post":
    "https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx?consignmentid={tracking_id}",
  BlueDart: "https://www.bluedart.com/tracking?trackingNo={tracking_id}"
};

export function buildTrackingUrl(courierName: CourierName, trackingId: string) {
  const template = COURIER_TRACKING_TEMPLATES[courierName];
  const encoded = encodeURIComponent(trackingId.trim());
  return template.replace("{tracking_id}", encoded);
}

