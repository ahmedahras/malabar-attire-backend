ALTER TABLE seller_risk_metrics
  DROP CONSTRAINT IF EXISTS seller_risk_metrics_risk_level_check;

ALTER TABLE seller_risk_metrics
  ADD CONSTRAINT seller_risk_metrics_risk_level_check
  CHECK (risk_level IN ('NORMAL', 'MONITORED', 'ISOLATED', 'BLOCKED'));

ALTER TABLE seller_risk_metrics
  ALTER COLUMN risk_level SET DEFAULT 'NORMAL';

UPDATE seller_risk_metrics
SET risk_level = CASE
  WHEN risk_level = 'normal' THEN 'NORMAL'
  WHEN risk_level = 'watch' THEN 'MONITORED'
  WHEN risk_level = 'critical' THEN 'BLOCKED'
  ELSE risk_level
END;
