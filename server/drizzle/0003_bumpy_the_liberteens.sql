CREATE TABLE "events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"ingest_item_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_timestamp" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"release" text,
	"environment" text,
	"level" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "events_ingest_item_id_unique" UNIQUE("ingest_item_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"grouping_version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'error' NOT NULL,
	"status" text DEFAULT 'unresolved' NOT NULL,
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ingest_item_id_ingest_items_id_fk" FOREIGN KEY ("ingest_item_id") REFERENCES "public"."ingest_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "events_project_event_id_unique" ON "events" USING btree ("project_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_project_fingerprint_version_unique" ON "issues" USING btree ("project_id","fingerprint","grouping_version");