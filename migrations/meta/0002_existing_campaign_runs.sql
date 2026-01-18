CREATE TABLE "existing_campaign_runs" (
  "run_id" text PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"(id),
  "external_id" text,
  "payload_original" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "pairs_array" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "preview_text" text NOT NULL DEFAULT '',
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "errors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL,
  "can_continue" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now()
);
