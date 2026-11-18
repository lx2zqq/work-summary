ALTER TABLE "settings" ALTER COLUMN "show_fixed_phrase" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "custom_phrases" jsonb DEFAULT '[]'::jsonb NOT NULL;