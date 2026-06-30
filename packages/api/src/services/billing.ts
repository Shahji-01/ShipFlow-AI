import { type PrismaClient, BillingTier } from "@shipflow/database";

/**
 * Tier configuration defining limits for each billing tier.
 *
 * Requirements: 9.1, 9.2
 */
export const TIER_LIMITS = {
  [BillingTier.FREE]: {
    aiReviewCredits: 10,
    maxRepositories: 2,
  },
  [BillingTier.PRO]: {
    aiReviewCredits: 100,
    maxRepositories: 20,
  },
} as const;

/**
 * Usage types tracked in the system.
 */
export const USAGE_TYPES = {
  AI_REVIEW: "ai_review",
  REPO_CONNECTION: "repo_connection",
} as const;

export type UsageType = (typeof USAGE_TYPES)[keyof typeof USAGE_TYPES];

/**
 * Result of a usage limit check.
 */
export interface UsageLimitResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  message?: string;
}

/**
 * Gets or creates a billing subscription for a workspace.
 * New workspaces start on the FREE tier.
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @returns The billing subscription record
 */
export async function getOrCreateSubscription(
  db: PrismaClient,
  workspaceId: string
) {
  let subscription = await db.billingSubscription.findUnique({
    where: { workspaceId },
  });

  if (!subscription) {
    const now = new Date();
    const cycleEnd = new Date(now);
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);

    subscription = await db.billingSubscription.create({
      data: {
        workspaceId,
        tier: BillingTier.FREE,
        aiReviewCredits: TIER_LIMITS[BillingTier.FREE].aiReviewCredits,
        maxRepositories: TIER_LIMITS[BillingTier.FREE].maxRepositories,
        billingCycleStart: now,
        billingCycleEnd: cycleEnd,
      },
    });
  }

  return subscription;
}

/**
 * Gets current usage count for a specific type within the active billing cycle.
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @param type - The usage type to check
 * @param periodStart - Start of the billing period
 * @param periodEnd - End of the billing period
 * @returns The total usage count for the period
 */
export async function getCurrentUsage(
  db: PrismaClient,
  workspaceId: string,
  type: UsageType,
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  const result = await db.usageLog.aggregate({
    where: {
      workspaceId,
      type,
      periodStart: { gte: periodStart },
      periodEnd: { lte: periodEnd },
    },
    _sum: {
      count: true,
    },
  });

  return result._sum.count ?? 0;
}

/**
 * Checks if a workspace can perform a usage action based on its subscription limits.
 * This is the primary enforcement function callable from other routers.
 *
 * Requirements: 9.2, 9.3
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @param type - The usage type to check (ai_review or repo_connection)
 * @returns UsageLimitResult indicating whether the action is allowed
 */
export async function checkUsageLimit(
  db: PrismaClient,
  workspaceId: string,
  type: UsageType
): Promise<UsageLimitResult> {
  const subscription = await getOrCreateSubscription(db, workspaceId);

  let limit: number;
  let currentUsage: number;

  if (type === USAGE_TYPES.AI_REVIEW) {
    limit = subscription.aiReviewCredits;
    currentUsage = await getCurrentUsage(
      db,
      workspaceId,
      type,
      subscription.billingCycleStart,
      subscription.billingCycleEnd
    );
  } else if (type === USAGE_TYPES.REPO_CONNECTION) {
    limit = subscription.maxRepositories;
    // For repo connections, count active repositories in the workspace
    currentUsage = await db.repository.count({
      where: {
        project: {
          workspaceId,
        },
      },
    });
  } else {
    return {
      allowed: true,
      currentUsage: 0,
      limit: 0,
      remaining: 0,
    };
  }

  const remaining = Math.max(0, limit - currentUsage);
  const allowed = currentUsage < limit;

  return {
    allowed,
    currentUsage,
    limit,
    remaining,
    message: allowed
      ? undefined
      : type === USAGE_TYPES.AI_REVIEW
        ? `AI review credit limit reached (${limit} per month). Upgrade your plan or wait for the billing cycle to reset.`
        : `Repository connection limit reached (${limit} repositories). Upgrade your plan to connect more repositories.`,
  };
}

/**
 * Records a usage event for a workspace.
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @param type - The usage type to record
 * @param count - Number of units used (default: 1)
 */
export async function recordUsage(
  db: PrismaClient,
  workspaceId: string,
  type: UsageType,
  count: number = 1
): Promise<void> {
  const subscription = await getOrCreateSubscription(db, workspaceId);

  await db.usageLog.create({
    data: {
      workspaceId,
      type,
      count,
      periodStart: subscription.billingCycleStart,
      periodEnd: subscription.billingCycleEnd,
    },
  });
}

/**
 * Resets usage for a workspace when the billing cycle renews or plan is upgraded.
 * Deletes all usage logs for the current period and updates the billing cycle.
 *
 * Requirements: 9.3
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @param newCycleStart - Start of the new billing cycle
 * @param newCycleEnd - End of the new billing cycle
 */
export async function resetUsage(
  db: PrismaClient,
  workspaceId: string,
  newCycleStart: Date,
  newCycleEnd: Date
): Promise<void> {
  await db.usageLog.deleteMany({
    where: {
      workspaceId,
      periodStart: { lt: newCycleStart },
    },
  });

  await db.billingSubscription.update({
    where: { workspaceId },
    data: {
      billingCycleStart: newCycleStart,
      billingCycleEnd: newCycleEnd,
      nextRenewalDate: newCycleEnd,
    },
  });
}

/**
 * Upgrades a workspace subscription to a new tier and resets usage.
 *
 * @param db - Prisma client instance
 * @param workspaceId - The workspace ID
 * @param newTier - The new billing tier
 * @param razorpaySubId - Optional Razorpay subscription ID
 * @param razorpayCustomerId - Optional Razorpay customer ID
 */
export async function upgradeSubscription(
  db: PrismaClient,
  workspaceId: string,
  newTier: BillingTier,
  razorpaySubId?: string,
  razorpayCustomerId?: string
): Promise<void> {
  const now = new Date();
  const newCycleEnd = new Date(now);
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

  const tierLimits = TIER_LIMITS[newTier];

  await db.billingSubscription.update({
    where: { workspaceId },
    data: {
      tier: newTier,
      aiReviewCredits: tierLimits.aiReviewCredits,
      maxRepositories: tierLimits.maxRepositories,
      billingCycleStart: now,
      billingCycleEnd: newCycleEnd,
      nextRenewalDate: newCycleEnd,
      razorpaySubId: razorpaySubId ?? undefined,
      razorpayCustomerId: razorpayCustomerId ?? undefined,
      cancelledAt: null,
    },
  });

  // Reset usage on plan upgrade (Requirement 9.3)
  await resetUsage(db, workspaceId, now, newCycleEnd);
}
