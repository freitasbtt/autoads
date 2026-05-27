import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const {
  DATABASE_URL,
  POSTGRES_USER = "metaads",
  POSTGRES_PASSWORD = "metaads",
  POSTGRES_DB = "metaads",
  POSTGRES_HOST = "postgres",
  POSTGRES_PORT = "5432",
} = process.env;

const connectionString =
  DATABASE_URL ??
  `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(
    POSTGRES_PASSWORD,
  )}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set (or POSTGRES_* envs). Did you forget to provision a database?",
  );
}

const { Pool } = pg;
export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export async function pingDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export async function ensureGcsStorageSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE app_settings
      ADD COLUMN IF NOT EXISTS gcs_bucket_name text
    `);

    await client.query(`
      ALTER TABLE app_settings
      ADD COLUMN IF NOT EXISTS gcs_service_account_json text
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storage_upload_links (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        created_by_user_id integer REFERENCES users(id),
        name text NOT NULL,
        path_prefix text NOT NULL DEFAULT '',
        public_id text NOT NULL UNIQUE,
        expires_at timestamp NOT NULL,
        revoked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storage_uploads (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        upload_link_id integer REFERENCES storage_upload_links(id),
        uploaded_by_user_id integer REFERENCES users(id),
        bucket_name text NOT NULL,
        object_path text NOT NULL,
        original_file_name text NOT NULL,
        content_type text NOT NULL,
        size_bytes integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storage_tasks (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        storage_upload_id integer NOT NULL REFERENCES storage_uploads(id),
        upload_link_id integer REFERENCES storage_upload_links(id),
        batch_id text,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        pairs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        distribution_json jsonb NOT NULL DEFAULT '{"destinations":[]}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS batch_id text
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS pairs_json jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS distribution_json jsonb NOT NULL DEFAULT '{"destinations":[]}'::jsonb
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ALTER COLUMN distribution_json SET DEFAULT '{"destinations":[]}'::jsonb
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storage_task_uploads (
        id serial PRIMARY KEY,
        task_id integer NOT NULL REFERENCES storage_tasks(id),
        storage_upload_id integer NOT NULL REFERENCES storage_uploads(id),
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_destination_snapshots (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        campaign_id text NOT NULL,
        adset_id text NOT NULL,
        destination_type text NOT NULL DEFAULT 'WEBSITE',
        page_id text,
        instagram_user_id text,
        leadgen_form_id text,
        whatsapp_number text,
        source text NOT NULL DEFAULT 'meta',
        synced_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_destination_snapshots
      ON meta_destination_snapshots (tenant_id, ad_account_id, campaign_id, adset_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_account_snapshots (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        resource_id integer REFERENCES resources(id),
        ad_account_id text NOT NULL,
        account_name text NOT NULL,
        connection_status text NOT NULL DEFAULT 'connected',
        synced_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_account_snapshots
      ON meta_account_snapshots (tenant_id, ad_account_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_campaign_snapshots (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        campaign_id text NOT NULL,
        name text,
        objective text,
        status text,
        buying_type text,
        configured_status text,
        effective_status text,
        daily_budget text,
        lifetime_budget text,
        updated_time text,
        special_ad_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_campaign_snapshots
      ON meta_campaign_snapshots (tenant_id, ad_account_id, campaign_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_adset_snapshots (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        campaign_id text NOT NULL,
        adset_id text NOT NULL,
        name text,
        status text,
        configured_status text,
        effective_status text,
        optimization_goal text,
        billing_event text,
        bid_strategy text,
        updated_time text,
        promoted_object jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_adset_snapshots
      ON meta_adset_snapshots (tenant_id, ad_account_id, campaign_id, adset_id)
    `);
  } finally {
    client.release();
  }
}
