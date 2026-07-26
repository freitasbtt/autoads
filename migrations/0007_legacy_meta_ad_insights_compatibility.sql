-- Compatibiliza a tabela criada pela versao anterior do cache do dashboard.
-- Esta migracao preserva as linhas existentes e as torna legiveis pelo novo
-- sincronizador, que usa date_start/date_stop e os campos *_json.
ALTER TABLE "meta_ad_insights_daily"
  ADD COLUMN IF NOT EXISTS "date_start" date,
  ADD COLUMN IF NOT EXISTS "date_stop" date,
  ADD COLUMN IF NOT EXISTS "campaign_name" text,
  ADD COLUMN IF NOT EXISTS "adset_name" text,
  ADD COLUMN IF NOT EXISTS "reach" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inline_link_clicks" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "link_clicks" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cpc" numeric(14, 6),
  ADD COLUMN IF NOT EXISTS "cpm" numeric(14, 6),
  ADD COLUMN IF NOT EXISTS "cpp" numeric(14, 6),
  ADD COLUMN IF NOT EXISTS "cost_per_lead" numeric(14, 6),
  ADD COLUMN IF NOT EXISTS "video_plays" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_p25" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_p50" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_p75" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_p95" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "video_p100" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "thruplays" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "actions_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "cost_per_action_type_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "raw_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_ad_insights_daily'
      AND column_name = 'date'
  ) THEN
    EXECUTE '
      UPDATE meta_ad_insights_daily
      SET date_start = COALESCE(date_start, date),
          date_stop = COALESCE(date_stop, date)
      WHERE date_start IS NULL OR date_stop IS NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_ad_insights_daily'
      AND column_name = 'actions'
  ) THEN
    EXECUTE '
      UPDATE meta_ad_insights_daily
      SET actions_json = actions
      WHERE actions_json = ''[]''::jsonb AND actions IS NOT NULL
    ';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_ad_insights_daily'
      AND column_name = 'cost_per_action_type'
  ) THEN
    EXECUTE '
      UPDATE meta_ad_insights_daily
      SET cost_per_action_type_json = cost_per_action_type
      WHERE cost_per_action_type_json = ''[]''::jsonb
        AND cost_per_action_type IS NOT NULL
    ';
  END IF;
END $$;

UPDATE "meta_ad_insights_daily"
SET
  "adset_id" = COALESCE("adset_id", ''),
  "synced_at" = COALESCE("synced_at", "created_at", now())
WHERE "adset_id" IS NULL OR "synced_at" IS NULL;

ALTER TABLE "meta_ad_insights_daily"
  ALTER COLUMN "date_start" SET NOT NULL,
  ALTER COLUMN "date_stop" SET NOT NULL,
  ALTER COLUMN "adset_id" SET NOT NULL,
  ALTER COLUMN "synced_at" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_meta_ad_insights_daily_tenant_ad_date"
  ON "meta_ad_insights_daily" ("tenant_id", "ad_account_id", "ad_id", "date_start", "date_stop");

CREATE INDEX IF NOT EXISTS "idx_meta_ad_insights_daily_tenant_account_date"
  ON "meta_ad_insights_daily" ("tenant_id", "ad_account_id", "date_start");
