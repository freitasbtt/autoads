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
      ALTER TABLE resources
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    `);

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
        configuration_elapsed_seconds integer NOT NULL DEFAULT 0,
        last_activity_at timestamp,
        automation_started_at timestamp,
        automation_finished_at timestamp,
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
      ADD COLUMN IF NOT EXISTS configuration_elapsed_seconds integer NOT NULL DEFAULT 0
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS last_activity_at timestamp
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS automation_started_at timestamp
    `);

    await client.query(`
      ALTER TABLE storage_tasks
      ADD COLUMN IF NOT EXISTS automation_finished_at timestamp
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

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_resources_tenant_id
      ON resources (tenant_id, id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_campaigns_tenant_id
      ON campaigns (tenant_id, id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_tenant_id
      ON users (tenant_id, id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_storage_upload_links_tenant_id
      ON storage_upload_links (tenant_id, id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_storage_uploads_tenant_id
      ON storage_uploads (tenant_id, id)
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_account_tenant_fk') THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_account_tenant_fk
          FOREIGN KEY (tenant_id, account_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_page_tenant_fk') THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_page_tenant_fk
          FOREIGN KEY (tenant_id, page_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_instagram_tenant_fk') THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_instagram_tenant_fk
          FOREIGN KEY (tenant_id, instagram_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_whatsapp_tenant_fk') THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_whatsapp_tenant_fk
          FOREIGN KEY (tenant_id, whatsapp_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_leadform_tenant_fk') THEN
          ALTER TABLE campaigns
          ADD CONSTRAINT campaigns_leadform_tenant_fk
          FOREIGN KEY (tenant_id, leadform_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'automations_campaign_tenant_fk') THEN
          ALTER TABLE automations
          ADD CONSTRAINT automations_campaign_tenant_fk
          FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_metrics_account_tenant_fk') THEN
          ALTER TABLE campaign_metrics
          ADD CONSTRAINT campaign_metrics_account_tenant_fk
          FOREIGN KEY (tenant_id, account_id) REFERENCES resources (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaign_metrics_campaign_tenant_fk') THEN
          ALTER TABLE campaign_metrics
          ADD CONSTRAINT campaign_metrics_campaign_tenant_fk
          FOREIGN KEY (tenant_id, campaign_id) REFERENCES campaigns (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_upload_links_user_tenant_fk') THEN
          ALTER TABLE storage_upload_links
          ADD CONSTRAINT storage_upload_links_user_tenant_fk
          FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_uploads_link_tenant_fk') THEN
          ALTER TABLE storage_uploads
          ADD CONSTRAINT storage_uploads_link_tenant_fk
          FOREIGN KEY (tenant_id, upload_link_id) REFERENCES storage_upload_links (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_uploads_user_tenant_fk') THEN
          ALTER TABLE storage_uploads
          ADD CONSTRAINT storage_uploads_user_tenant_fk
          FOREIGN KEY (tenant_id, uploaded_by_user_id) REFERENCES users (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_tasks_upload_tenant_fk') THEN
          ALTER TABLE storage_tasks
          ADD CONSTRAINT storage_tasks_upload_tenant_fk
          FOREIGN KEY (tenant_id, storage_upload_id) REFERENCES storage_uploads (tenant_id, id) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'storage_tasks_link_tenant_fk') THEN
          ALTER TABLE storage_tasks
          ADD CONSTRAINT storage_tasks_link_tenant_fk
          FOREIGN KEY (tenant_id, upload_link_id) REFERENCES storage_upload_links (tenant_id, id) NOT VALID;
        END IF;
      END $$;
    `);
    await client.query(`
      ALTER TABLE campaigns VALIDATE CONSTRAINT campaigns_account_tenant_fk;
      ALTER TABLE campaigns VALIDATE CONSTRAINT campaigns_page_tenant_fk;
      ALTER TABLE campaigns VALIDATE CONSTRAINT campaigns_instagram_tenant_fk;
      ALTER TABLE campaigns VALIDATE CONSTRAINT campaigns_whatsapp_tenant_fk;
      ALTER TABLE campaigns VALIDATE CONSTRAINT campaigns_leadform_tenant_fk;
      ALTER TABLE automations VALIDATE CONSTRAINT automations_campaign_tenant_fk;
      ALTER TABLE campaign_metrics VALIDATE CONSTRAINT campaign_metrics_account_tenant_fk;
      ALTER TABLE campaign_metrics VALIDATE CONSTRAINT campaign_metrics_campaign_tenant_fk;
      ALTER TABLE storage_upload_links VALIDATE CONSTRAINT storage_upload_links_user_tenant_fk;
      ALTER TABLE storage_uploads VALIDATE CONSTRAINT storage_uploads_link_tenant_fk;
      ALTER TABLE storage_uploads VALIDATE CONSTRAINT storage_uploads_user_tenant_fk;
      ALTER TABLE storage_tasks VALIDATE CONSTRAINT storage_tasks_upload_tenant_fk;
      ALTER TABLE storage_tasks VALIDATE CONSTRAINT storage_tasks_link_tenant_fk;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_goals (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        account_id integer NOT NULL REFERENCES resources(id),
        account_name text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        target_spend numeric(14,2) NOT NULL,
        target_leads integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_tenant_dashboard_goal
      ON dashboard_goals (tenant_id, account_id, start_date, end_date)
    `);
  } finally {
    client.release();
  }
}

export async function ensureDashboardSyncSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dashboard_sync_status') THEN
          CREATE TYPE dashboard_sync_status AS ENUM ('never_synced', 'active', 'paused', 'syncing', 'error');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meta_sync_job_type') THEN
          CREATE TYPE meta_sync_job_type AS ENUM (
            'sync_entities',
            'sync_today_insights',
            'sync_recent_insights',
            'sync_historical_insights',
            'sync_manual'
          );
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meta_sync_job_status') THEN
          CREATE TYPE meta_sync_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_sync_accounts (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        account_name text NOT NULL,
        sync_enabled boolean NOT NULL DEFAULT false,
        sync_status dashboard_sync_status NOT NULL DEFAULT 'never_synced',
        sync_frequency_minutes integer NOT NULL DEFAULT 30,
        first_enabled_at timestamp,
        last_enabled_at timestamp,
        disabled_at timestamp,
        last_manual_sync_at timestamp,
        last_auto_sync_at timestamp,
        last_success_sync_at timestamp,
        last_failed_sync_at timestamp,
        last_error_message text,
        created_by integer REFERENCES users(id),
        updated_by integer REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_campaigns (
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
        raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_adsets (
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
        raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_ads (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        campaign_id text,
        adset_id text,
        ad_id text NOT NULL,
        creative_id text,
        name text,
        status text,
        effective_status text,
        raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_creatives (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        creative_id text NOT NULL,
        name text,
        thumbnail_url text,
        image_url text,
        storage_thumbnail_bucket text,
        storage_thumbnail_path text,
        storage_thumbnail_content_type text,
        storage_thumbnail_source_url text,
        asset_status text NOT NULL DEFAULT 'pending',
        asset_synced_at timestamp,
        asset_error_message text,
        last_seen_at timestamp,
        raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE meta_creatives
        ADD COLUMN IF NOT EXISTS storage_thumbnail_bucket text,
        ADD COLUMN IF NOT EXISTS storage_thumbnail_path text,
        ADD COLUMN IF NOT EXISTS storage_thumbnail_content_type text,
        ADD COLUMN IF NOT EXISTS storage_thumbnail_source_url text,
        ADD COLUMN IF NOT EXISTS asset_status text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS asset_synced_at timestamp,
        ADD COLUMN IF NOT EXISTS asset_error_message text,
        ADD COLUMN IF NOT EXISTS last_seen_at timestamp
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_ad_insights_daily (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        campaign_id text NOT NULL,
        adset_id text NOT NULL,
        ad_id text NOT NULL,
        date_start date NOT NULL,
        date_stop date NOT NULL,
        campaign_name text,
        adset_name text,
        ad_name text,
        spend numeric(14, 4) NOT NULL DEFAULT 0,
        impressions integer NOT NULL DEFAULT 0,
        reach integer NOT NULL DEFAULT 0,
        frequency numeric(14, 6),
        clicks integer NOT NULL DEFAULT 0,
        inline_link_clicks integer NOT NULL DEFAULT 0,
        link_clicks integer NOT NULL DEFAULT 0,
        ctr numeric(14, 6),
        cpc numeric(14, 6),
        cpm numeric(14, 6),
        cpp numeric(14, 6),
        leads integer NOT NULL DEFAULT 0,
        cost_per_lead numeric(14, 6),
        video_plays integer NOT NULL DEFAULT 0,
        video_p25 integer NOT NULL DEFAULT 0,
        video_p50 integer NOT NULL DEFAULT 0,
        video_p75 integer NOT NULL DEFAULT 0,
        video_p95 integer NOT NULL DEFAULT 0,
        video_p100 integer NOT NULL DEFAULT 0,
        thruplays integer NOT NULL DEFAULT 0,
        actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        cost_per_action_type_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        synced_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_sync_jobs (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        ad_account_id text NOT NULL,
        job_type meta_sync_job_type NOT NULL,
        job_source text NOT NULL DEFAULT 'manual',
        date_start date,
        date_end date,
        status meta_sync_job_status NOT NULL DEFAULT 'pending',
        priority integer NOT NULL DEFAULT 100,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        started_at timestamp,
        finished_at timestamp,
        error_message text,
        created_by integer REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS dashboard_share_links (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id),
        public_id text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        account_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        campaign_id text,
        objective text,
        status text,
        expires_at timestamp NOT NULL,
        created_by integer REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_sync_accounts_tenant_account
      ON dashboard_sync_accounts (tenant_id, ad_account_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_campaigns_tenant_campaign
      ON meta_campaigns (tenant_id, ad_account_id, campaign_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_adsets_tenant_adset
      ON meta_adsets (tenant_id, ad_account_id, adset_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_ads_tenant_ad
      ON meta_ads (tenant_id, ad_account_id, ad_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_creatives_tenant_creative
      ON meta_creatives (tenant_id, ad_account_id, creative_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_meta_creatives_tenant_asset_status
      ON meta_creatives (tenant_id, asset_status)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_meta_ad_insights_daily_tenant_ad_date
      ON meta_ad_insights_daily (tenant_id, ad_account_id, ad_id, date_start, date_stop)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_dashboard_share_links_public_id
      ON dashboard_share_links (public_id)
    `);
  } finally {
    client.release();
  }
}
