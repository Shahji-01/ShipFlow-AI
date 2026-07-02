/**
 * Typed event definitions for ShipFlow AI workflows.
 * Each event represents an asynchronous operation processed by Inngest.
 */

/** Data payload for PRD generation event */
export interface FeaturePrdGenerateData {
  featureRequestId: string;
  workspaceId: string;
  userId: string;
}

/** Data payload for task generation event */
export interface PrdTasksGenerateData {
  prdId: string;
  workspaceId: string;
  userId: string;
}

/** Data payload for PR review event */
export interface ReviewPrReviewData {
  pullRequestId: string;
  repositoryId: string;
  workspaceId: string;
  iteration: number;
  reviewId: string;
}

/** Data payload emitted after an AI review completes, to check release readiness */
export interface ReviewCompletedData {
  pullRequestId: string;
  workspaceId: string;
  iteration: number;
  hasBlockingIssues: boolean;
}

/** Data payload for webhook processing event */
export interface WebhookProcessData {
  provider: "github";
  eventType: string;
  payload: Record<string, unknown>;
  repositoryId: string;
  workspaceId: string;
  deliveryId: string;
}

/** Recipient targeting for a notification dispatch. */
export interface NotifyTarget {
  /** Explicit user ids to notify. */
  userIds?: string[];
  /** Notify all workspace members holding any of these roles. */
  roles?: Array<"ADMIN" | "MEMBER" | "APPROVER">;
  /** Also notify the creator of the referenced feature request. */
  includeFeatureCreator?: boolean;
}

/** Data payload for the centralized notification dispatcher. */
export interface NotifyDispatchData {
  workspaceId: string;
  /** Used to resolve the feature creator and build default links. */
  featureRequestId?: string | null;
  target: NotifyTarget;
  /** Notification.type tag (e.g. "ai_review", "approval_requested"). */
  type: string;
  title: string;
  body?: string;
  link?: string;
  /**
   * Optional notificationPrefs key to respect. If a recipient has explicitly
   * disabled this key, they are skipped. Omit to always deliver.
   */
  prefKey?: string;
  /** Whether to also fan out to the workspace Slack channel. Default true. */
  slack?: boolean;
  /** Optional activity-feed entry to record alongside the notification. */
  activity?: {
    actorId?: string | null;
    type: string;
    message: string;
    entityType?: string;
    entityId?: string;
  };
}

/**
 * Map of all ShipFlow event names to their schemas.
 * Used with EventSchemas.fromRecord<T>() for type-safe Inngest events.
 */
export type ShipFlowEvents = {
  "feature/prd.generate": {
    data: FeaturePrdGenerateData;
  };
  "prd/tasks.generate": {
    data: PrdTasksGenerateData;
  };
  "review/pr.review": {
    data: ReviewPrReviewData;
  };
  "review/completed": {
    data: ReviewCompletedData;
  };
  "webhook/process": {
    data: WebhookProcessData;
  };
  "notify/dispatch": {
    data: NotifyDispatchData;
  };
};
