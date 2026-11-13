CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_date" date NOT NULL,
	"raw_input" text DEFAULT '' NOT NULL,
	"draft" jsonb NOT NULL,
	"final_text" text DEFAULT '' NOT NULL,
	"style" text DEFAULT 'concise' NOT NULL,
	"conversation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_review_date_unique" UNIQUE("review_date")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_style" text DEFAULT 'concise' NOT NULL,
	"show_jiaoyan" boolean DEFAULT true NOT NULL,
	"show_kunnan" boolean DEFAULT false NOT NULL,
	"show_fixed_phrase" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grade" text,
	"subjects" text,
	"status" text DEFAULT '在读' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
