CREATE TABLE IF NOT EXISTS failed_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_name TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB,
  error_message TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_jobs_queue ON failed_jobs(queue_name);
CREATE INDEX IF NOT EXISTS idx_failed_jobs_failed_at ON failed_jobs(failed_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL,
  actor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
