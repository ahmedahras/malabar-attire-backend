ALTER TABLE system_state
  ADD COLUMN IF NOT EXISTS mismatch_count_last_run INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_reconciliation_runs INTEGER NOT NULL DEFAULT 0;

ALTER TABLE seller_balance
  ADD COLUMN IF NOT EXISTS last_revalidation_check TIMESTAMPTZ;
