ALTER TABLE "resources" ADD COLUMN "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
