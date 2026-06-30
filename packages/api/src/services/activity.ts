import { type PrismaClient } from "@shipflow/database";

/**
 * Record an activity-feed entry for a workspace. Best-effort: failures are
 * swallowed so activity logging never breaks the primary operation.
 *
 * Note: in-app notifications + Slack fan-out are handled by the centralized
 * `notify/dispatch` Inngest function (see @shipflow/inngest), which also writes
 * activity entries for workflow-originated events. This helper is used for
 * synchronous, request-side activity logging (project/repo/feature mutations).
 */
export async function recordActivity(
  db: PrismaClient,
  input: {
    workspaceId: string;
    actorId?: string | null;
    type: string;
    message: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.activity.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId ?? null,
        type: input.type,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as object | undefined,
      },
    });
  } catch {
    // non-critical
  }
}
