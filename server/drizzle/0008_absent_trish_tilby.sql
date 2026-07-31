CREATE TABLE "replay_segments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"replay_id" uuid NOT NULL,
	"segment_id" integer NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_segments_replay_segment_unique" UNIQUE("replay_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "replay_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"replay_id" text NOT NULL,
	"platform" text,
	"release" text,
	"environment" text,
	"replay_type" text DEFAULT 'session' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"url_list" jsonb DEFAULT '[]'::jsonb,
	"error_ids" jsonb DEFAULT '[]'::jsonb,
	"trace_ids" jsonb DEFAULT '[]'::jsonb,
	"segment_count" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_sessions_project_replay_id_unique" UNIQUE("project_id","replay_id")
);
--> statement-breakpoint
ALTER TABLE "replay_segments" ADD CONSTRAINT "replay_segments_replay_id_replay_sessions_id_fk" FOREIGN KEY ("replay_id") REFERENCES "public"."replay_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_sessions" ADD CONSTRAINT "replay_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;