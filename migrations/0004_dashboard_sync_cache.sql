CREATE TYPE "public"."dashboard_sync_status" AS ENUM('never_synced', 'active', 'paused', 'syncing', 'error');
CREATE TYPE "public"."meta_sync_job_type" AS ENUM('sync_entities', 'sync_today_insights', 'sync_recent_insights', 'sync_historical_insights', 'sync_manual');
CREATE TYPE "public"."meta_sync_job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE "dashboard_sync_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "account_name" text NOT NULL,
  "sync_enabled" boolean DEFAULT false NOT NULL,
  "sync_status" "dashboard_sync_status" DEFAULT 'never_synced' NOT NULL,
  "sync_frequency_minutes" integer DEFAULT 30 NOT NULL,
  "first_enabled_at" timestamp,
  "last_enabled_at" timestamp,
  "disabled_at" timestamp,
  "last_manual_sync_at" timestamp,
  "last_auto_sync_at" timestamp,
  "last_success_sync_at" timestamp,
  "last_failed_sync_at" timestamp,
  "last_error_message" text,
  "created_by" integer,
  "updated_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "campaign_id" text NOT NULL,
  "name" text,
  "objective" text,
  "status" text,
  "buying_type" text,
  "configured_status" text,
  "effective_status" text,
  "daily_budget" text,
  "lifetime_budget" text,
  "updated_time" text,
  "special_ad_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_adsets" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "campaign_id" text NOT NULL,
  "adset_id" text NOT NULL,
  "name" text,
  "status" text,
  "configured_status" text,
  "effective_status" text,
  "optimization_goal" text,
  "billing_event" text,
  "bid_strategy" text,
  "updated_time" text,
  "promoted_object" jsonb,
  "raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_ads" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "campaign_id" text,
  "adset_id" text,
  "ad_id" text NOT NULL,
  "creative_id" text,
  "name" text,
  "status" text,
  "effective_status" text,
  "raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_creatives" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "creative_id" text NOT NULL,
  "name" text,
  "thumbnail_url" text,
  "image_url" text,
  "raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_ad_insights_daily" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "campaign_id" text NOT NULL,
  "adset_id" text NOT NULL,
  "ad_id" text NOT NULL,
  "date_start" date NOT NULL,
  "date_stop" date NOT NULL,
  "campaign_name" text,
  "adset_name" text,
  "ad_name" text,
  "spend" numeric(14, 4) DEFAULT '0' NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "reach" integer DEFAULT 0 NOT NULL,
  "frequency" numeric(14, 6),
  "clicks" integer DEFAULT 0 NOT NULL,
  "inline_link_clicks" integer DEFAULT 0 NOT NULL,
  "link_clicks" integer DEFAULT 0 NOT NULL,
  "ctr" numeric(14, 6),
  "cpc" numeric(14, 6),
  "cpm" numeric(14, 6),
  "cpp" numeric(14, 6),
  "leads" integer DEFAULT 0 NOT NULL,
  "cost_per_lead" numeric(14, 6),
  "video_plays" integer DEFAULT 0 NOT NULL,
  "video_p25" integer DEFAULT 0 NOT NULL,
  "video_p50" integer DEFAULT 0 NOT NULL,
  "video_p75" integer DEFAULT 0 NOT NULL,
  "video_p95" integer DEFAULT 0 NOT NULL,
  "video_p100" integer DEFAULT 0 NOT NULL,
  "thruplays" integer DEFAULT 0 NOT NULL,
  "actions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cost_per_action_type_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "meta_sync_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL,
  "ad_account_id" text NOT NULL,
  "job_type" "meta_sync_job_type" NOT NULL,
  "job_source" text DEFAULT 'manual' NOT NULL,
  "date_start" date,
  "date_end" date,
  "status" "meta_sync_job_status" DEFAULT 'pending' NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "error_message" text,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "dashboard_sync_accounts" ADD CONSTRAINT "dashboard_sync_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "dashboard_sync_accounts" ADD CONSTRAINT "dashboard_sync_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "dashboard_sync_accounts" ADD CONSTRAINT "dashboard_sync_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_adsets" ADD CONSTRAINT "meta_adsets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_creatives" ADD CONSTRAINT "meta_creatives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_ad_insights_daily" ADD CONSTRAINT "meta_ad_insights_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "meta_sync_jobs" ADD CONSTRAINT "meta_sync_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

CREATE UNIQUE INDEX "uniq_dashboard_sync_accounts_tenant_account" ON "dashboard_sync_accounts" USING btree ("tenant_id","ad_account_id");
CREATE UNIQUE INDEX "uniq_meta_campaigns_tenant_campaign" ON "meta_campaigns" USING btree ("tenant_id","ad_account_id","campaign_id");
CREATE UNIQUE INDEX "uniq_meta_adsets_tenant_adset" ON "meta_adsets" USING btree ("tenant_id","ad_account_id","adset_id");
CREATE UNIQUE INDEX "uniq_meta_ads_tenant_ad" ON "meta_ads" USING btree ("tenant_id","ad_account_id","ad_id");
CREATE UNIQUE INDEX "uniq_meta_creatives_tenant_creative" ON "meta_creatives" USING btree ("tenant_id","ad_account_id","creative_id");
CREATE UNIQUE INDEX "uniq_meta_ad_insights_daily_tenant_ad_date" ON "meta_ad_insights_daily" USING btree ("tenant_id","ad_account_id","ad_id","date_start","date_stop");
