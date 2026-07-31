CREATE TABLE "processing_failures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"error_code" text NOT NULL,
	"message" text NOT NULL,
	"attempts" integer NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_failures_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "processing_failures" ADD CONSTRAINT "processing_failures_item_id_ingest_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."ingest_items"("id") ON DELETE cascade ON UPDATE no action;