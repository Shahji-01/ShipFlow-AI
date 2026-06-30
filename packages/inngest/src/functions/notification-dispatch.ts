import { inngest } from "../client";
import prisma from "@shipflow/database";
import { decryptSecret } from "../crypto";

/**
 * Centralized notification dispatcher.
 *
 * Every producer (tRPC routers and other workflows) emits a single
 * `notify/dispatch` event instead of writing notifications directly. This
 * function resolves the recipient set, respects per-user notification
 * preferences, writes in-app notifications, records an optional activity-feed
 * entry, and fans out to the workspace Slack channel.
 *
 * Centralizing delivery keeps preference handling and channel fan-out in one
 * place and avoids a circular dependency between the API and inngest packages.
 */

/** Post a plain-text message to a Slack incoming webhook. Best-effort. */
async function postSlack(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // best-effort — never throw from notifications
  }
}

export const notificationDispatch = inngest.createFunction(
  { id: "notification-dispatch", name: "Notification Dispatch", retries: 2 },
  { event: "notify/dispatch" },
  async ({ event, step }) => {
    const data = event.data;

    // Step 1: record the optional activity-feed entry.
    if (data.activity) {
      await step.run("record-activity", async () => {
        await prisma.activity.create({
          data: {
            workspaceId: data.workspaceId,
            actorId: data.activity!.actorId ?? null,
            type: data.activity!.type,
            message: data.activity!.message,
            entityType: data.activity!.entityType,
            entityId: data.activity!.entityId,
          },
        });
      });
    }

    // Step 2: resolve the recipient user ids.
    const recipientIds = await step.run("resolve-recipients", async () => {
      const ids = new Set<string>(data.target.userIds ?? []);

      if (data.target.includeFeatureCreator && data.featureRequestId) {
        const feature = await prisma.featureRequest.findUnique({
          where: { id: data.featureRequestId },
          select: { createdById: true },
        });
        if (feature?.createdById) ids.add(feature.createdById);
      }

      if (data.target.roles && data.target.roles.length > 0) {
        const members = await prisma.workspaceMember.findMany({
          where: {
            workspaceId: data.workspaceId,
            role: { in: data.target.roles },
          },
          select: { userId: true },
        });
        for (const m of members) ids.add(m.userId);
      }

      return Array.from(ids);
    });

    // Step 3: filter by notification preferences and create notifications.
    const delivered = await step.run("create-notifications", async () => {
      if (recipientIds.length === 0) return 0;

      let targets = recipientIds;

      // Respect explicit opt-outs when a preference key is supplied.
      if (data.prefKey) {
        const users = await prisma.user.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, notificationPrefs: true },
        });
        const optedOut = new Set(
          users
            .filter((u) => {
              const prefs = (u.notificationPrefs as Record<string, boolean> | null) ?? {};
              return prefs[data.prefKey!] === false;
            })
            .map((u) => u.id)
        );
        targets = recipientIds.filter((id) => !optedOut.has(id));
      }

      if (targets.length === 0) return 0;

      await prisma.notification.createMany({
        data: targets.map((userId) => ({
          userId,
          workspaceId: data.workspaceId,
          type: data.type,
          title: data.title,
          body: data.body,
          link: data.link,
        })),
      });

      return targets.length;
    });

    // Step 4: fan out to Slack (best-effort).
    if (data.slack !== false) {
      await step.run("slack-fanout", async () => {
        const workspace = await prisma.workspace.findUnique({
          where: { id: data.workspaceId },
          select: { slackWebhookUrl: true },
        });
        if (!workspace?.slackWebhookUrl) return;

        const text = data.body
          ? `*${data.title}*\n${data.body}`
          : `*${data.title}*`;
        await postSlack(decryptSecret(workspace.slackWebhookUrl), text);
      });
    }

    return { delivered, recipients: recipientIds.length };
  }
);
