-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'expired');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'success', 'failed', 'abandoned');

-- AlterEnum
ALTER TYPE "ScanOutcome" ADD VALUE 'blocked_plan';

-- CreateTable
CREATE TABLE "plans" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'GHS',
    "price_monthly_minor" BIGINT NOT NULL DEFAULT 0,
    "price_yearly_minor" BIGINT NOT NULL DEFAULT 0,
    "limits" JSONB NOT NULL DEFAULT '{}',
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "org_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "interval" "BillingInterval",
    "trial_ends_at" TIMESTAMPTZ(6),
    "current_period_end" TIMESTAMPTZ(6),
    "granted_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("org_id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provider_ref" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "checkout_url" TEXT,
    "channel" TEXT,
    "provider_data" JSONB,
    "failure_note" TEXT,
    "period_start" TIMESTAMPTZ(6),
    "period_end" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhooks" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT,
    "event" TEXT,
    "signature_valid" BOOLEAN,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "error" TEXT,

    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_org_id_created_at_idx" ON "payments"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_webhooks_reference_idx" ON "payment_webhooks"("reference");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "plans"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Starting plans (prices are placeholders; Super Admins can edit them in Admin → Plans).
INSERT INTO "plans" ("code", "name", "description", "currency", "price_monthly_minor", "price_yearly_minor", "limits", "features", "sort_order") VALUES
  ('free',  'Free',  'Try it out with a few codes.',                    'GHS', 0,     0,
   '{"maxQr": 3, "maxMenus": 1, "scansPerMonth": 500, "analyticsDays": 7}',
   '{"logo": false, "svgDownload": false, "locationAnalytics": false, "removeBranding": false}', 0),
  ('basic', 'Basic', 'For a single shop, restaurant or event.',         'GHS', 4900,  49000,
   '{"maxQr": 25, "maxMenus": 5, "scansPerMonth": 10000, "analyticsDays": 90}',
   '{"logo": true, "svgDownload": true, "locationAnalytics": true, "removeBranding": false}', 1),
  ('pro',   'Pro',   'Unlimited codes and menus, no platform branding.', 'GHS', 14900, 149000,
   '{"maxQr": 0, "maxMenus": 0, "scansPerMonth": 0, "analyticsDays": 365}',
   '{"logo": true, "svgDownload": true, "locationAnalytics": true, "removeBranding": true}', 2);

-- Businesses created before billing start on the Free plan.
INSERT INTO "subscriptions" ("org_id", "plan_code", "status", "updated_at")
SELECT "id", 'free', 'active', now() FROM "organizations";

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_minor_check" CHECK ("amount_minor" >= 0);
