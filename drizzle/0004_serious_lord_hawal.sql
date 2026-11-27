ALTER TABLE "memories" ADD COLUMN "lifecycle" text DEFAULT 'permanent' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "archive_after" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "archive_reason" text;--> statement-breakpoint
CREATE INDEX "memories_lifecycle_status_idx" ON "memories" USING btree ("lifecycle","status","expires_at");--> statement-breakpoint
CREATE INDEX "memories_status_archive_after_idx" ON "memories" USING btree ("status","archive_after");