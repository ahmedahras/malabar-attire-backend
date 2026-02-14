import { db } from "../db/pool";
import type { QueryRunner } from "../db/types";

type LedgerInput = {
  sellerId: string;
  orderId: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  reason: string;
};

const getRunner = (runner?: QueryRunner) => runner ?? db;

export const insertLedgerEntryIdempotent = async (
  input: LedgerInput,
  runner?: QueryRunner
) => {
  const client = getRunner(runner);
  const normalizedAmount = Number(input.amount.toFixed(2));

  const result = await client.query<{ id: string }>(
    `INSERT INTO seller_ledger (seller_id, order_id, amount, type, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (seller_id, order_id, type, reason) DO NOTHING
     RETURNING id`,
    [input.sellerId, input.orderId, normalizedAmount, input.type, input.reason]
  );

  return {
    inserted: Boolean(result.rows[0]),
    ledgerId: result.rows[0]?.id ?? null
  };
};

export const markLedgerSettledForPayout = async (
  sellerId: string,
  payoutId: string,
  runner?: QueryRunner
) => {
  const client = getRunner(runner);
  const update = await client.query<{ id: string }>(
    `UPDATE seller_ledger
     SET settled_at = NOW(),
         payout_id = $2
     WHERE seller_id = $1
       AND settled_at IS NULL
       AND type = 'CREDIT'
     RETURNING id`,
    [sellerId, payoutId]
  );

  return { settledCount: update.rows.length };
};

