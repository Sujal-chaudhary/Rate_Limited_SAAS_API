CREATE TABLE usage(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      window_start TIMESTAMP NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      tokens_remaining NUMERIC,
      flushed_at TIMESTAMP DEFAULT now(),
      job_id TEXT, --as they are strings not UUID
      UNIQUE(tenant_id, window_start) -- stops creating duplicate row and stop tenant to billed twice in case of any error or failure
);

/* 
concepts:-

Why this matters in background jobs:
In background processing, a golden rule is: jobs can and will run more than once.

1. A worker might crash right after inserting the data, before telling BullMQ "I'm done".
2. BullMQ thinks the job died and triggers a retry.
3. Or a network hiccup causes the job to be picked up twice.

Without UNIQUE(tenant_id, window_start):
Job 1. flushes usage for Tenant A at 14:00 $\rightarrow$ Row inserted.
Job 2. retries and flushes again for Tenant A at 14:00 $\rightarrow$ Duplicate row inserted!
Now when finance or analytics queries total requests, Tenant A gets billed twice.

With UNIQUE(tenant_id, window_start):
Job 1 inserts the row.
Job 2 runs for the same tenant and same window $\rightarrow$ PostgreSQL stops it immediately because (tenant_id, window_start) already exists!


 */