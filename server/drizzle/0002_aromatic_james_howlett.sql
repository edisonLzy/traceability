CREATE TYPE "public"."ingest_item_status" AS ENUM('pending', 'ignored', 'invalid', 'processing', 'processed', 'processed_duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "ingest_envelopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"project_key_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"origin" text,
	"user_agent" text,
	"checksum" text NOT NULL,
	"sanitized_envelope" "bytea" NOT NULL,
	"item_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"envelope_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"header" jsonb NOT NULL,
	"payload" "bytea",
	"payload_json" jsonb,
	"event_id" text,
	"status" "ingest_item_status" NOT NULL,
	"handler_version" integer DEFAULT 1 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"envelope_id" uuid NOT NULL,
	"item_id" uuid,
	"category" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_envelopes" ADD CONSTRAINT "ingest_envelopes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_envelopes" ADD CONSTRAINT "ingest_envelopes_project_key_id_project_keys_id_fk" FOREIGN KEY ("project_key_id") REFERENCES "public"."project_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_items" ADD CONSTRAINT "ingest_items_envelope_id_ingest_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."ingest_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_item_id_ingest_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ingest_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_envelope_id_ingest_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."ingest_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_item_id_ingest_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ingest_items"("id") ON DELETE cascade ON UPDATE no action;