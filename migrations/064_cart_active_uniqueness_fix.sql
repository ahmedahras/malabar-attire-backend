-- Keep only one ACTIVE cart per user.
-- Previous UNIQUE(user_id, status) caused checkout failures once users accumulated
-- more than one converted/abandoned cart over time.

ALTER TABLE carts
  DROP CONSTRAINT IF EXISTS carts_user_id_status_key;

DROP INDEX IF EXISTS carts_user_id_status_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_one_active_per_user
  ON carts(user_id)
  WHERE status = 'active';

