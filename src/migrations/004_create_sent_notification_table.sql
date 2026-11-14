CREATE TABLE sent_notification(
     id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id),
     threshold INT NOT NULL,
     sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
     sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(tenant_id, threshold, sent_date)
);