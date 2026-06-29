CREATE TABLE "materials" (
	"alloy" text PRIMARY KEY NOT NULL,
	"category" text DEFAULT 'Aluminium Casting' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" text PRIMARY KEY NOT NULL,
	"part_number" text NOT NULL,
	"description" text NOT NULL,
	"alloy" text NOT NULL,
	"cast_wt" double precision NOT NULL,
	"machining_wt" double precision NOT NULL,
	"as_cast" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "parts_part_number_unique" UNIQUE("part_number")
);
--> statement-breakpoint
CREATE TABLE "pos" (
	"id" text PRIMARY KEY NOT NULL,
	"po_num" text NOT NULL,
	"part_number" text NOT NULL,
	"vendor_code" text NOT NULL,
	"plant" text NOT NULL,
	"base_price" double precision NOT NULL,
	"base_quarter" text NOT NULL,
	"grn_qty" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rm_index" (
	"alloy" text NOT NULL,
	"quarter" text NOT NULL,
	"value" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rm_index_alloy_quarter_pk" PRIMARY KEY("alloy","quarter")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"quarters" text[] NOT NULL,
	"alloys" text[] NOT NULL,
	"prev_q" text NOT NULL,
	"new_q" text NOT NULL,
	"amendment_reason" text DEFAULT '' NOT NULL,
	"scrap_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"vendor_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_alloy_materials_alloy_fk" FOREIGN KEY ("alloy") REFERENCES "public"."materials"("alloy") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos" ADD CONSTRAINT "pos_part_number_parts_part_number_fk" FOREIGN KEY ("part_number") REFERENCES "public"."parts"("part_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos" ADD CONSTRAINT "pos_vendor_code_vendors_vendor_code_fk" FOREIGN KEY ("vendor_code") REFERENCES "public"."vendors"("vendor_code") ON DELETE no action ON UPDATE no action;