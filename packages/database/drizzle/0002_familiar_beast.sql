CREATE TABLE "document_counters" (
	"tenant_id" uuid NOT NULL,
	"scope" varchar(40) NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "document_counters_tenant_id_scope_pk" PRIMARY KEY("tenant_id","scope")
);
--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;