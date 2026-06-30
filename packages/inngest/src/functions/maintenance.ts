import { inngest } from "../client";
import prisma from "@shipflow/database";

/**
 * Scheduled maintenance jobs.
 *
 * webhookEventPrune: deletes processed-webhook idempotency records older than
 * the retention window. Providers only retry deliveries for a short period, so
 * keeping ~7 days is more than enough to dedupe while bounding table growth.
 */

const RETENTION_DAYS = 7;

export const webhookEventPrune = inngest.createFunction(
  { id: "webhook-event-prune", name: "Prune Processed Webhook Events" },
  { cron: "0 3 * * *" }, // daily at 03:00 UTC
  async ({ step }) => {
    const deleted = await step.run("prune", async () => {
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
      );
      const result = await prisma.processedWebhookEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return result.count;
    });

    return { deleted, retentionDays: RETENTION_DAYS };
  }
);
