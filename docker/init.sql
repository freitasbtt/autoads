DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('system_admin', 'tenant_admin', 'member');
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'system_admin';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'tenant_admin';
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'member';
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audiences (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  interests JSONB NOT NULL DEFAULT '[]'::jsonb,
  cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  behaviors TEXT[],
  locations TEXT[],
  custom_list_file TEXT,
  estimated_size TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  status_detail TEXT,
  account_id INTEGER REFERENCES resources(id),
  page_id INTEGER REFERENCES resources(id),
  instagram_id INTEGER REFERENCES resources(id),
  whatsapp_id INTEGER REFERENCES resources(id),
  leadform_id INTEGER REFERENCES resources(id),
  website_url TEXT,
  ad_sets JSONB,
  creatives JSONB,
  budget TEXT,
  audience_ids INTEGER[],
  title TEXT,
  message TEXT,
  drive_folder_id TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  campaign_id INTEGER REFERENCES campaigns(id),
  webhook_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB,
  response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  meta_app_id TEXT,
  meta_app_secret TEXT,
  google_client_id TEXT,
  google_client_secret TEXT,
  n8n_webhook_url TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (name)
SELECT 'Default Tenant'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE name = 'Default Tenant');

UPDATE users SET role = 'tenant_admin' WHERE role = 'admin';
UPDATE users SET role = 'member' WHERE role = 'client';

INSERT INTO users (tenant_id, email, password, role)
SELECT t.id, 'admin@test.com', '$2b$10$qs8tYIFItq94y9N/s90hGO4x9s/1Y7WjtLLcPCJLN/gqHAGJGDptC', 'system_admin'
FROM tenants t
WHERE t.name = 'Default Tenant'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@test.com');

INSERT INTO users (tenant_id, email, password, role)
SELECT t.id, 'sysadmin2@test.com', '$2b$10$oP2RpkfT0o4SK.iiFzHyG.jBHZPtiVd2kNxNHlng7t7xbSPrJPOHq', 'system_admin'
FROM tenants t
WHERE t.name = 'Default Tenant'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'sysadmin2@test.com');
