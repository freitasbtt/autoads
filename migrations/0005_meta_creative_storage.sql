ALTER TABLE "meta_creatives"
  ADD COLUMN IF NOT EXISTS "storage_thumbnail_bucket" text,
  ADD COLUMN IF NOT EXISTS "storage_thumbnail_path" text,
  ADD COLUMN IF NOT EXISTS "storage_thumbnail_content_type" text,
  ADD COLUMN IF NOT EXISTS "storage_thumbnail_source_url" text,
  ADD COLUMN IF NOT EXISTS "asset_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "asset_synced_at" timestamp,
  ADD COLUMN IF NOT EXISTS "asset_error_message" text,
  ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp;

CREATE INDEX IF NOT EXISTS "idx_meta_creatives_tenant_asset_status"
  ON "meta_creatives" ("tenant_id", "asset_status");
