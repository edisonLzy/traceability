ALTER TABLE "projects" DROP CONSTRAINT "projects_organization_id_organizations_id_fk";
--> statement-breakpoint
DROP INDEX "projects_organization_slug_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "organizations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "organizations" CASCADE;
