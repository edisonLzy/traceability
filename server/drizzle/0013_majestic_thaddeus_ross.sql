CREATE TABLE "inbox_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"inbox_item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'p2' NOT NULL,
	"trigger_reason" text NOT NULL,
	"summary" text,
	"hypothesis" text,
	"next_action" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_activities" ADD CONSTRAINT "inbox_activities_inbox_item_id_inbox_items_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_activities_item_created_idx" ON "inbox_activities" USING btree ("inbox_item_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_issue_unique" ON "inbox_items" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "inbox_items_project_state_activity_idx" ON "inbox_items" USING btree ("project_id","state","last_activity_at");--> statement-breakpoint
INSERT INTO "inbox_items" (
	"id",
	"project_id",
	"issue_id",
	"state",
	"priority",
	"trigger_reason",
	"last_activity_at",
	"completed_at",
	"created_at",
	"updated_at"
)
SELECT
	md5("id"::text || ':inbox-item')::uuid,
	"project_id",
	"id",
	CASE "status"
		WHEN 'resolved' THEN 'done'
		WHEN 'ignored' THEN 'dismissed'
		ELSE 'open'
	END,
	'p2',
	'Existing issue added to Inbox',
	"updated_at",
	CASE WHEN "status" IN ('resolved', 'ignored') THEN "updated_at" ELSE NULL END,
	"created_at",
	"updated_at"
FROM "issues";--> statement-breakpoint
INSERT INTO "inbox_activities" (
	"id",
	"inbox_item_id",
	"type",
	"actor_type",
	"payload",
	"created_at"
)
SELECT
	md5("id"::text || ':created-activity')::uuid,
	"id",
	'created',
	'system',
	jsonb_build_object('state', "state", 'reason', 'migration_backfill'),
	"created_at"
FROM "inbox_items";
