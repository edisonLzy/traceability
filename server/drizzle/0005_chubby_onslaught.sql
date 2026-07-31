ALTER TABLE "projects" ADD COLUMN "sentry_project_id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_sentry_project_id_unique" UNIQUE("sentry_project_id");