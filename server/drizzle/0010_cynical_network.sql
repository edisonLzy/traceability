CREATE TABLE "metric_samples" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"ingest_item_id" uuid NOT NULL,
	"sample_index" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"trace_id" text,
	"span_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"unit" text,
	"value" double precision NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_spans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"ingest_item_id" uuid NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"op" text,
	"status" text,
	"is_segment" boolean DEFAULT false NOT NULL,
	"start_timestamp" timestamp with time zone NOT NULL,
	"end_timestamp" timestamp with time zone NOT NULL,
	"duration_ms" double precision NOT NULL,
	"release" text,
	"environment" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"measurements" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_policies" ALTER COLUMN "enabled_item_types" SET DEFAULT '["event","transaction","span","trace_metric"]'::jsonb;--> statement-breakpoint
UPDATE "project_policies"
SET "enabled_item_types" = "enabled_item_types" || '["transaction"]'::jsonb
WHERE NOT "enabled_item_types" ? 'transaction';--> statement-breakpoint
UPDATE "project_policies"
SET "enabled_item_types" = "enabled_item_types" || '["span"]'::jsonb
WHERE NOT "enabled_item_types" ? 'span';--> statement-breakpoint
UPDATE "project_policies"
SET "enabled_item_types" = "enabled_item_types" || '["trace_metric"]'::jsonb
WHERE NOT "enabled_item_types" ? 'trace_metric';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "span_id" text;--> statement-breakpoint
ALTER TABLE "metric_samples" ADD CONSTRAINT "metric_samples_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_samples" ADD CONSTRAINT "metric_samples_ingest_item_id_ingest_items_id_fk" FOREIGN KEY ("ingest_item_id") REFERENCES "public"."ingest_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_spans" ADD CONSTRAINT "trace_spans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_spans" ADD CONSTRAINT "trace_spans_ingest_item_id_ingest_items_id_fk" FOREIGN KEY ("ingest_item_id") REFERENCES "public"."ingest_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "metric_samples_item_index_unique" ON "metric_samples" USING btree ("ingest_item_id","sample_index");--> statement-breakpoint
CREATE INDEX "metric_samples_project_timestamp_idx" ON "metric_samples" USING btree ("project_id","timestamp");--> statement-breakpoint
CREATE INDEX "metric_samples_project_name_type_timestamp_idx" ON "metric_samples" USING btree ("project_id","name","type","timestamp");--> statement-breakpoint
CREATE INDEX "metric_samples_project_trace_idx" ON "metric_samples" USING btree ("project_id","trace_id");--> statement-breakpoint
CREATE INDEX "metric_samples_project_span_idx" ON "metric_samples" USING btree ("project_id","span_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trace_spans_project_trace_span_unique" ON "trace_spans" USING btree ("project_id","trace_id","span_id");--> statement-breakpoint
CREATE INDEX "trace_spans_project_start_idx" ON "trace_spans" USING btree ("project_id","start_timestamp");--> statement-breakpoint
CREATE INDEX "trace_spans_project_trace_idx" ON "trace_spans" USING btree ("project_id","trace_id");--> statement-breakpoint
CREATE INDEX "trace_spans_project_segment_start_idx" ON "trace_spans" USING btree ("project_id","is_segment","start_timestamp");--> statement-breakpoint
CREATE INDEX "events_project_trace_id_idx" ON "events" USING btree ("project_id","trace_id");
