CREATE TABLE "minidumps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"ingest_item_id" uuid NOT NULL,
	"event_id" text,
	"file_name" text NOT NULL,
	"content_type" text DEFAULT 'application/x-dmp' NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_policies" ALTER COLUMN "enabled_item_types" SET DEFAULT '["event","attachment","transaction","span","trace_metric"]'::jsonb;--> statement-breakpoint
UPDATE "project_policies"
SET "enabled_item_types" = "enabled_item_types" || '["attachment"]'::jsonb,
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "enabled_item_types" ? 'event'
  AND NOT "enabled_item_types" ? 'attachment';--> statement-breakpoint
ALTER TABLE "minidumps" ADD CONSTRAINT "minidumps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minidumps" ADD CONSTRAINT "minidumps_ingest_item_id_ingest_items_id_fk" FOREIGN KEY ("ingest_item_id") REFERENCES "public"."ingest_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "minidumps_ingest_item_unique" ON "minidumps" USING btree ("ingest_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "minidumps_storage_key_unique" ON "minidumps" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "minidumps_project_event_idx" ON "minidumps" USING btree ("project_id","event_id");
