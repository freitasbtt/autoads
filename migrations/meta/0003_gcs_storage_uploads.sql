ALTER TABLE "app_settings"
ADD COLUMN "gcs_bucket_name" text,
ADD COLUMN "gcs_service_account_json" text;

CREATE TABLE "storage_upload_links" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "created_by_user_id" integer REFERENCES "users"("id"),
  "name" text NOT NULL,
  "path_prefix" text NOT NULL DEFAULT '',
  "public_id" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "storage_uploads" (
  "id" serial PRIMARY KEY NOT NULL,
  "tenant_id" integer NOT NULL REFERENCES "tenants"("id"),
  "upload_link_id" integer REFERENCES "storage_upload_links"("id"),
  "uploaded_by_user_id" integer REFERENCES "users"("id"),
  "bucket_name" text NOT NULL,
  "object_path" text NOT NULL,
  "original_file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
