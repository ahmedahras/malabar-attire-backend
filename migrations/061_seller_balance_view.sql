CREATE OR REPLACE VIEW seller_balance_view AS
SELECT
  sl.seller_id,
  COALESCE(
    SUM(
      CASE
        WHEN sl.type = 'CREDIT' THEN sl.amount
        WHEN sl.type = 'DEBIT' THEN -sl.amount
        ELSE 0
      END
    ),
    0
  )::numeric AS net_balance,
  COALESCE(
    SUM(CASE WHEN sl.type = 'CREDIT' AND sl.settled_at IS NULL THEN sl.amount ELSE 0 END),
    0
  )::numeric AS available_balance,
  COALESCE(
    SUM(CASE WHEN sl.type = 'DEBIT' AND sl.reason ILIKE '%RTO%' THEN sl.amount ELSE 0 END),
    0
  )::numeric AS rto_deductions
FROM seller_ledger sl
GROUP BY sl.seller_id;

