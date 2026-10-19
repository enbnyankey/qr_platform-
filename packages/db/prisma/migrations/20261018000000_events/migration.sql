-- Event pages: weddings, funerals and other occasions with a designed programme page and QR card.

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('wedding', 'funeral', 'birthday', 'church', 'corporate', 'other');

-- AlterEnum
ALTER TYPE "QrType" ADD VALUE 'event';

-- AlterTable
ALTER TABLE "qr_codes" ADD COLUMN     "event_id" UUID;

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "kind" "EventKind" NOT NULL,
    "title" TEXT NOT NULL,
    "event_date" DATE,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "content" JSONB NOT NULL DEFAULT '{}',
    "card" JSONB NOT NULL DEFAULT '{}',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_org_id_created_at_idx" ON "events"("org_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "qr_codes_event_id_idx" ON "qr_codes"("event_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

