CREATE TABLE IF NOT EXISTS job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_logs_queue ON job_logs(queue_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_logs(status, created_at DESC);
