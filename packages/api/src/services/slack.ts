import { type PrismaClient } from "@shipflow/database";
import { decryptSecret } from "../lib/crypto";
import { logger } from "./../lib/logger";

/**
 * Slack notification service.
 *
 * Posts messages to a workspace's configured Slack Incoming Webhook URL.
 * The URL is stored encrypted at rest on the Workspace record. All sends are
 * best-effort — a Slack failure must never break the primary operation.
 */

/**
 * Post a plain-text message to a Slack incoming-webhook URL.
 * Returns true on a 2xx response, false otherwise.
 */
export async function sendSlackMessage(
  webhookUrl: string,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      logger.warn("Slack webhook returned non-2xx", { status: res.status });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("Slack webhook send failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Look up a workspace's Slack webhook (decrypting it) and post a message.
 * No-op when the workspace has no Slack integration configured.
 */
export async function notifyWorkspaceSlack(
  db: PrismaClient,
  workspaceId: string,
  text: string
): Promise<void> {
  try {
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { slackWebhookUrl: true },
    });
    if (!workspace?.slackWebhookUrl) return;

    const url = decryptSecret(workspace.slackWebhookUrl);
    await sendSlackMessage(url, text);
  } catch {
    // best-effort — never throw from notifications
  }
}
