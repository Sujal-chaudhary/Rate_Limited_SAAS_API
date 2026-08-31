CREATE TABLE tenants(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE users(
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES tenants(id),
     email TEXT UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE api_keys(
   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- identifies THIS ROW in the DB
                                                   -- (used to delete/update a specific key)
   tenant_id UUID NOT NULL REFERENCES tenants(id), -- which tenant owns this key
   key_hash TEXT UNIQUE NOT NULL, -- used to LOOK UP the key on each request
   label TEXT, -- human name: "Production", "Test"
   created_at TIMESTAMP DEFAULT now(),  -- when was this key created
   revoked_at TIMESTAMP -- null = active, has value = revoked
);

CREATE TABLE resources(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);t