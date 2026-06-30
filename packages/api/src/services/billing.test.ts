import { describe, it, expect, vi } from "vitest";
import { BillingTier, type PrismaClient } from "@shipflow/database";
import { checkUsageLimit, TIER_LIMITS, USAGE_TYPES } from "./billing";

const now = new Date();
const cycleEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

function subscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sub_1",
    workspaceId: "ws_1",
    tier: BillingTier.FREE,
    aiReviewCredits: TIER_LIMITS[BillingTier.FREE].aiReviewCredits,
    maxRepositories: TIER_LIMITS[BillingTier.FREE].maxRepositories,
    billingCycleStart: now,
    billingCycleEnd: cycleEnd,
    ...overrides,
  };
}

function mockDb(opts: {
  sub?: ReturnType<typeof subscription>;
  usageSum?: number | null;
  repoCount?: number;
}): PrismaClient {
  return {
    billingSubscription: {
      findUnique: vi.fn().mockResolvedValue(opts.sub ?? subscription()),
      create: vi.fn().mockResolvedValue(opts.sub ?? subscription()),
    },
    usageLog: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { count: opts.usageSum ?? 0 } }),
    },
    repository: {
      count: vi.fn().mockResolvedValue(opts.repoCount ?? 0),
    },
  } as unknown as PrismaClient;
}

describe("checkUsageLimit - AI reviews", () => {
  it("allows AI review when under the credit limit", async () => {
    const db = mockDb({ usageSum: 3 });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.AI_REVIEW);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.currentUsage).toBe(3);
    expect(result.remaining).toBe(7);
  });

  it("blocks AI review when the credit limit is exhausted", async () => {
    const db = mockDb({ usageSum: 10 });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.AI_REVIEW);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.message).toMatch(/credit limit reached/i);
  });

  it("treats a null usage sum as zero usage", async () => {
    const db = mockDb({ usageSum: null });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.AI_REVIEW);

    expect(result.allowed).toBe(true);
    expect(result.currentUsage).toBe(0);
  });
});

describe("checkUsageLimit - repository connections", () => {
  it("allows connecting a repo when under the limit", async () => {
    const db = mockDb({ repoCount: 1 });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.REPO_CONNECTION);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(2);
    expect(result.remaining).toBe(1);
  });

  it("blocks connecting a repo at the limit", async () => {
    const db = mockDb({ repoCount: 2 });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.REPO_CONNECTION);

    expect(result.allowed).toBe(false);
    expect(result.message).toMatch(/repository connection limit/i);
  });

  it("uses higher PRO-tier limits when subscribed", async () => {
    const db = mockDb({
      sub: subscription({
        tier: BillingTier.PRO,
        maxRepositories: TIER_LIMITS[BillingTier.PRO].maxRepositories,
      }),
      repoCount: 5,
    });
    const result = await checkUsageLimit(db, "ws_1", USAGE_TYPES.REPO_CONNECTION);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(20);
  });
});
