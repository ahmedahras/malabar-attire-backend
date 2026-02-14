export const calculateCommission = (orderTotal: number, commissionPercent: number) => {
  const platformCommissionAmount = Number(
    (orderTotal * (commissionPercent / 100)).toFixed(2)
  );
  const sellerPayoutAmount = Number((orderTotal - platformCommissionAmount).toFixed(2));

  return {
    commissionPercent,
    platformCommissionAmount,
    sellerPayoutAmount
  };
};

export const buildPayoutCycleKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const executePayout = async (
  _client: import("../db/types").QueryRunner,
  _sellerId: string,
  _cycleKey: string,
  _threshold: number
) => {
  return { skipped: true as const, reason: "disabled_manual_payout_mode" };
};

export const applyRefundAdjustment = async (
  client: import("../db/types").QueryRunner,
  input: {
    sellerId: string;
    orderId: string;
    amount: number;
    type: "REFUND" | "CHARGEBACK" | "MANUAL";
  }
) => {
  await client.query(
    `INSERT INTO refund_adjustments (seller_id, order_id, amount, type)
     VALUES ($1, $2, $3, $4)`,
    [input.sellerId, input.orderId, input.amount, input.type]
  );

  const { rows } = await client.query<{ pending_amount: string | number }>(
    `UPDATE seller_balance
     SET pending_amount = pending_amount - $2,
         updated_at = NOW()
     WHERE seller_id = $1
     RETURNING pending_amount`,
    [input.sellerId, input.amount]
  );

  const pending = Number(rows[0]?.pending_amount ?? 0);
  return { pending };
};
