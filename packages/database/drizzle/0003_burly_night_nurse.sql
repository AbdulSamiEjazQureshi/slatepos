CREATE TYPE "public"."promotion_type" AS ENUM('PERCENT', 'FIXED', 'BOGO');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_key" varchar(300) NOT NULL,
	"provider" varchar(30) DEFAULT 'local' NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"original_name" varchar(255),
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"primary_table_id" uuid NOT NULL,
	"merged_table_id" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "promotion_type" DEFAULT 'PERCENT' NOT NULL,
	"value" numeric(8, 4) DEFAULT '0' NOT NULL,
	"code" varchar(40),
	"min_order" numeric(14, 4) DEFAULT '0' NOT NULL,
	"max_discount" numeric(14, 4),
	"branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_group" varchar(60),
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_merges" ADD CONSTRAINT "table_merges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_storage_key_unique" ON "files" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "files_tenant_idx" ON "files" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "table_merges_primary_idx" ON "table_merges" USING btree ("primary_table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_tenant_code_unique" ON "promotions" USING btree ("tenant_id","code") WHERE "promotions"."code" is not null;--> statement-breakpoint
CREATE INDEX "promotions_tenant_active_idx" ON "promotions" USING btree ("tenant_id","is_active");