import { db } from "../db/pool";
import { invalidatePattern } from "../utils/cache";
import { logger } from "../utils/logger";
import { logOrderTimeline } from "./ordersService";
import { NormalizedShipmentStatus } from "../utils/shiprocketStatus";
import {
  blockSettlementForRto,
  markOrderSettlementPendingIfEligible
} from "./settlement.service";

type UpdateShipmentInput = {
  awbCode: string;
  normalizedStatus: NormalizedShipmentStatus;
  rawStatus: string;
};

type UpdateShipmentResult =
  | { status: "updated"; shipmentId: string; orderId: string; sellerId: string | null }
  | { status: "not_found" };

export const updateShipmentStatusByAwb = async (
  input: UpdateShipmentInput
): Promise<UpdateShipmentResult> => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const shipmentResult = await client.query(
      `SELECT id, order_id, seller_id, shipment_status
       FROM order_shipments
       WHERE awb_code = $1
       LIMIT 1
       FOR UPDATE`,
      [input.awbCode]
    );

    const shipment = shipmentResult.rows[0] as
      | {
          id: string;
          order_id: string;
          seller_id: string | null;
          shipment_status: string | null;
        }
      | undefined;

    if (!shipment) {
      await client.query("COMMIT");
      logger.warn({ awbCode: input.awbCode }, "Shiprocket webhook shipment not found");
      return { status: "not_found" };
    }

    await client.query(
      `UPDATE order_shipments
       SET shipment_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [shipment.id, input.normalizedStatus]
    );

    await client.query(
      `INSERT INTO shipment_tracking_events (shipment_id, status, location, event_time)
       VALUES ($1, $2, $3, NOW())`,
      [shipment.id, input.normalizedStatus, null]
    );

    await logOrderTimeline(client, shipment.order_id, "SHIPMENT_STATUS_UPDATED", "shiprocket", {
      awbCode: input.awbCode,
      previousStatus: shipment.shipment_status,
      status: input.normalizedStatus,
      rawStatus: input.rawStatus
    });

    if (input.normalizedStatus === "DELIVERED") {
      const allDeliveredResult = await client.query(
        `SELECT COUNT(*)::int AS pending
         FROM order_shipments
         WHERE order_id = $1
           AND COALESCE(shipment_status, 'PROCESSING') <> 'DELIVERED'`,
        [shipment.order_id]
      );
      const pending = Number(allDeliveredResult.rows[0]?.pending ?? 0);
      if (pending === 0) {
        await client.query(
          `UPDATE orders
           SET status = 'COMPLETED',
               updated_at = NOW()
           WHERE id = $1
             AND status <> 'COMPLETED'
             AND status <> 'CANCELLED'`,
          [shipment.order_id]
        );
      }
    } else if (input.normalizedStatus === "RTO_DELIVERED") {
      await client.query(
        `UPDATE orders
         SET is_rto = TRUE,
             rto_flagged_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [shipment.order_id]
      );
      await blockSettlementForRto(shipment.order_id);
    } else if (input.normalizedStatus === "CANCELLED") {
      await client.query(
        `UPDATE order_shipments
         SET shipment_status = 'CANCELLED',
             updated_at = NOW()
         WHERE id = $1`,
        [shipment.id]
      );
    }

    await client.query("COMMIT");
    if (input.normalizedStatus === "DELIVERED") {
      await markOrderSettlementPendingIfEligible(shipment.order_id);
    }
    await invalidatePattern(`cache:orders:tracking:${shipment.order_id}`);
    return {
      status: "updated",
      shipmentId: shipment.id,
      orderId: shipment.order_id,
      sellerId: shipment.seller_id
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
