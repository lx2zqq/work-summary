CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"review_date" date,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_events_event_created_idx" ON "usage_events" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_review_date_idx" ON "usage_events" USING btree ("review_date");