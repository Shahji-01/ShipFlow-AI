-- AlterTable: Workspace gains an optional Slack incoming-webhook URL (encrypted at rest)
ALTER TABLE "workspaces" ADD COLUMN "slackWebhookUrl" TEXT;

-- AlterTable: Project gains optional team-specific QA review guidelines
ALTER TABLE "projects" ADD COLUMN "reviewGuidelines" VARCHAR(4000);

-- CreateTable: ProcessedWebhookEvent for inbound webhook idempotency
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_provider_eventId_key" ON "processed_webhook_events"("provider", "eventId");

-- CreateIndex
CREATE INDEX "processed_webhook_events_createdAt_idx" ON "processed_webhook_events"("createdAt");
