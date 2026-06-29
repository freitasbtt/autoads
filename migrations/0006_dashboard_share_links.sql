CREATE TABLE IF NOT EXISTS "dashboard_share_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "public"."tenants"("id"),
  "public_id" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "account_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "campaign_id" text,
  "objective" text,
  "status" text,
  "expires_at" timestamp NOT NULL,
  "created_by" integer REFERENCES "public"."users"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_dashboard_share_links_public_id"
  ON "dashboard_share_links" ("public_id");
