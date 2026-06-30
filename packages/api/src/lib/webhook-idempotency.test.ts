import { describe, it, expect, vi } from "vitest";
import { claimWebhookEvent } from "./webhook-idempotency";
import { type PrismaClient } from "@shipflow/database";

/**
 * Builds a minimal mock PrismaClient exposing only the
 * processedWebhookEvent.create method used by claimWebhookEvent.
 */
function mockDb(create: ReturnType<typeof vi.fn>): PrismaClient {
  return {
    processedWebhookEvent: { create },
  } as unknown as PrismaClient;
}

describe("claimWebhookEvent", () => {
  it("claims a first-time event and records it", async () => {
    const create = vi.fn().mockResolvedValue({ id: "1" });
    const db = mockDb(create);

    const result = await claimWebhookEvent(db, "github", "delivery-123", "push");

    expect(result).toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: { provider: "github", eventId: "delivery-123", eventType: "push" },
    });
  });

  it("treats a duplicate (unique violation P2002) as already processed", async () => {
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const db = mockDb(create);

    const result = await claimWebhookEvent(db, "razorpay", "evt_dup", "subscription.charged");

    expect(result).toBe(false);
  });

  it("allows processing when no event id is provided (cannot dedupe)", async () => {
    const create = vi.fn();
    const db = mockDb(create);

    const result = await claimWebhookEvent(db, "github", "", "ping");

    expect(result).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("rethrows unexpected database errors so the provider retries", async () => {
    const create = vi.fn().mockRejectedValue(new Error("connection lost"));
    const db = mockDb(create);

    await expect(
      claimWebhookEvent(db, "github", "delivery-err", "push")
    ).rejects.toThrow("connection lost");
  });

  it("passes null eventType when none is supplied", async () => {
    const create = vi.fn().mockResolvedValue({ id: "2" });
    const db = mockDb(create);

    await claimWebhookEvent(db, "razorpay", "evt_1");

    expect(create).toHaveBeenCalledWith({
      data: { provider: "razorpay", eventId: "evt_1", eventType: null },
    });
  });
});
