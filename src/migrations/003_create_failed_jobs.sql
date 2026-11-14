CREATE TABLE failed_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     TEXT NOT NULL,
  queue_name TEXT NOT NULL,
  tenant_id UUID  REFERENCES tenants(id),
  error_message TEXT,
  job_data     JSONB,
  attempts_made INTEGER,
  failed_at    TIMESTAMP DEFAULT now()
);