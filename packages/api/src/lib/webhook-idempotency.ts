import { type PrismaClient } from "@shipflow/database";

/**
 * Inbound webhook idempotency helper.
 *
 * Providers (GitHub, Razorpay) redeliver webhooks on timeout or retry, so the
 * same logical event can arrive multiple times. We record each delivery keyed
 * on (provider, eventId) with a unique constraint and treat a duplicate insert
 * as "already processed".
 *
 * `claimWebhookEvent` returns true when the caller has successfully claimed the
 * event (i.e. it is the first time we've seen it) and false when it is a
 * duplicate that should be skipped.
 */

// Prisma unique-constraint violation error code.
const UNIQUE_VIOLATION = "P2002";

export async function claimWebhookEvent(
  db: PrismaClient,
  provider: "github" | "razorpay",
  eventId: string,
  eventType?: string
): Promise<boolean> {
  // An empty/missing id can't be deduplicated reliably — allow processing but
  // the caller should log this case.
  if (!eventId) return true;

  try {
    await db.processedWebhookEvent.create({
      data: { provider, eventId, eventType: eventType ?? null },
    });
    return true;
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return false;
    }
    // Unexpected DB error — rethrow so the webhook returns 500 and the
    // provider retries (we'd rather retry than silently drop an event).
    throw err;
  }
}
