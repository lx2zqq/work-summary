CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"student_id" uuid,
	"student_name" text,
	"category" text DEFAULT '其他' NOT NULL,
	"content" text NOT NULL,
	"importance" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "memory_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "enable_memory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memories_status_scope_idx" ON "memories" USING btree ("status","scope");--> statement-breakpoint
CREATE INDEX "memories_student_idx" ON "memories" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "memories_source_date_idx" ON "memories" USING btree ("source_date");