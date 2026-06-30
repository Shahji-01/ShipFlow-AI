import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma, { BillingTier } from "@shipflow/database";
import { logger, claimWebhookEvent } from "@shipflow/api";

/**
 * Tier limits configuration (mirrored from billing service).
 */
const TIER_LIMITS = {
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
 * Validates a Razorpay webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyRazorpaySignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Razorpay Webhook Receiver (POST /api/webhooks/razorpay)
 *
 * Handles payment events from Razorpay:
 * - subscription.activated: Upgrade workspace to Pro tier
 * - subscription.charged: Renew billing cycle
 * - subscription.cancelled: Mark subscription as cancelled
 * - payment.failed: Log failure (user retries from UI)
 *
 * Requirements: 9.4, 9.5
 * - Updates subscription status within 30 seconds of payment confirmation
 * - Handles payment failures: displays error, retains current tier, allows retry
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    const eventId = req.headers.get("x-razorpay-event-id") ?? "";

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.error("Razorpay webhook RAZORPAY_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    // Validate signature
    if (!signature) {
      logger.warn("Razorpay webhook missing signature header");
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    const isValid = verifyRazorpaySignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      logger.warn("Razorpay webhook invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Parse the event payload
    let event: RazorpayWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      logger.warn("Razorpay webhook invalid JSON payload");
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    const eventType = event.event;

    // Idempotency: Razorpay retries deliveries. Skip events we've already
    // handled (cycle resets and usage deletes must not run twice).
    const isFirstDelivery = await claimWebhookEvent(
      prisma,
      "razorpay",
      eventId,
      eventType
    );
    if (!isFirstDelivery) {
      logger.info("Razorpay webhook duplicate delivery ignored", { eventId });
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    logger.info("Razorpay webhook processing event", { eventType, eventId });

    switch (eventType) {
      case "subscription.activated":
        await handleSubscriptionActivated(event);
        break;

      case "subscription.charged":
        await handleSubscriptionCharged(event);
        break;

      case "subscription.cancelled":
        await handleSubscriptionCancelled(event);
        break;

      case "payment_link.paid":
        await handlePaymentLinkPaid(event);
        break;

      case "payment.failed":
        await handlePaymentFailed(event);
        break;

      default:
        logger.info("Razorpay webhook unhandled event type", { eventType });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error("Razorpay webhook unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Handle subscription activation - upgrade workspace to Pro tier.
 * Requirement: 9.4 - Update subscription status within 30 seconds
 */
async function handleSubscriptionActivated(
  event: RazorpayWebhookEvent
): Promise<void> {
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (!subscriptionId) {
    logger.warn("Razorpay webhook: no subscription ID in activation event");
    return;
  }

  const subscription = await prisma.billingSubscription.findUnique({
    where: { razorpaySubId: subscriptionId },
  });

  if (!subscription) {
    logger.warn("Razorpay webhook: no matching subscription (activation)", {
      subscriptionId,
    });
    return;
  }
  const now = new Date();
  const newCycleEnd = new Date(now);
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

  const tierLimits = TIER_LIMITS[BillingTier.PRO];

  await prisma.billingSubscription.update({
    where: { workspaceId: subscription.workspaceId },
    data: {
      tier: BillingTier.PRO,
      aiReviewCredits: tierLimits.aiReviewCredits,
      maxRepositories: tierLimits.maxRepositories,
      billingCycleStart: now,
      billingCycleEnd: newCycleEnd,
      nextRenewalDate: newCycleEnd,
      cancelledAt: null,
    },
  });

  // Reset usage on upgrade (Requirement 9.3)
  await prisma.usageLog.deleteMany({
    where: {
      workspaceId: subscription.workspaceId,
      periodStart: { lt: now },
    },
  });

  logger.info("Razorpay webhook: workspace upgraded to PRO", {
    workspaceId: subscription.workspaceId,
  });
}

/**
 * Handle a paid one-time Payment Link - upgrade the workspace to Pro.
 *
 * Used for the Payment Link checkout flow (works without recurring payments
 * enabled on the merchant account). The workspace is identified via the
 * `workspaceId` note attached when the link was created, with a fallback to
 * matching the stored payment link id on the subscription record.
 */
async function handlePaymentLinkPaid(
  event: RazorpayWebhookEvent
): Promise<void> {
  const linkEntity = event.payload?.payment_link?.entity;
  const workspaceId = linkEntity?.notes?.workspaceId;
  const linkId = linkEntity?.id;

  const subscription = workspaceId
    ? await prisma.billingSubscription.findUnique({ where: { workspaceId } })
    : linkId
      ? await prisma.billingSubscription.findUnique({
          where: { razorpaySubId: linkId },
        })
      : null;

  if (!subscription) {
    logger.warn("Razorpay webhook: no matching subscription (payment link)", {
      workspaceId,
      linkId,
    });
    return;
  }

  const now = new Date();
  const newCycleEnd = new Date(now);
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

  const tierLimits = TIER_LIMITS[BillingTier.PRO];

  await prisma.billingSubscription.update({
    where: { workspaceId: subscription.workspaceId },
    data: {
      tier: BillingTier.PRO,
      aiReviewCredits: tierLimits.aiReviewCredits,
      maxRepositories: tierLimits.maxRepositories,
      billingCycleStart: now,
      billingCycleEnd: newCycleEnd,
      nextRenewalDate: newCycleEnd,
      cancelledAt: null,
    },
  });

  // Reset usage on upgrade (Requirement 9.3)
  await prisma.usageLog.deleteMany({
    where: {
      workspaceId: subscription.workspaceId,
      periodStart: { lt: now },
    },
  });

  logger.info("Razorpay webhook: workspace upgraded to PRO (payment link)", {
    workspaceId: subscription.workspaceId,
  });
}

/**
 * Handle subscription charged - renew the billing cycle.
 * Requirement: 9.3 - Reset usage on billing cycle renewal
 */
async function handleSubscriptionCharged(
  event: RazorpayWebhookEvent
): Promise<void> {
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (!subscriptionId) {
    logger.warn("Razorpay webhook: no subscription ID in charged event");
    return;
  }

  const subscription = await prisma.billingSubscription.findUnique({
    where: { razorpaySubId: subscriptionId },
  });

  if (!subscription) {
    logger.warn("Razorpay webhook: no matching subscription (charged)", {
      subscriptionId,
    });
    return;
  }
  const now = new Date();
  const newCycleEnd = new Date(now);
  newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

  await prisma.billingSubscription.update({
    where: { workspaceId: subscription.workspaceId },
    data: {
      billingCycleStart: now,
      billingCycleEnd: newCycleEnd,
      nextRenewalDate: newCycleEnd,
    },
  });

  await prisma.usageLog.deleteMany({
    where: {
      workspaceId: subscription.workspaceId,
      periodStart: { lt: now },
    },
  });

  logger.info("Razorpay webhook: billing cycle renewed", {
    workspaceId: subscription.workspaceId,
  });
}

/**
 * Handle subscription cancellation.
 */
async function handleSubscriptionCancelled(
  event: RazorpayWebhookEvent
): Promise<void> {
  const subscriptionId = event.payload?.subscription?.entity?.id;
  if (!subscriptionId) {
    logger.warn("Razorpay webhook: no subscription ID in cancellation event");
    return;
  }

  const subscription = await prisma.billingSubscription.findUnique({
    where: { razorpaySubId: subscriptionId },
  });

  if (!subscription) {
    logger.warn("Razorpay webhook: no matching subscription (cancellation)", {
      subscriptionId,
    });
    return;
  }
  const tierLimits = TIER_LIMITS[BillingTier.FREE];

  await prisma.billingSubscription.update({
    where: { workspaceId: subscription.workspaceId },
    data: {
      tier: BillingTier.FREE,
      aiReviewCredits: tierLimits.aiReviewCredits,
      maxRepositories: tierLimits.maxRepositories,
      razorpaySubId: null,
      cancelledAt: new Date(),
    },
  });

  logger.info("Razorpay webhook: subscription cancelled", {
    workspaceId: subscription.workspaceId,
  });
}

/**
 * Handle payment failure - log the failure.
 * Requirement: 9.5 - Display error reason, retain current tier, allow retry
 * The actual error display and retry happen on the client side.
 */
async function handlePaymentFailed(
  event: RazorpayWebhookEvent
): Promise<void> {
  const paymentEntity = event.payload?.payment?.entity;
  const errorCode = paymentEntity?.error_code ?? "unknown";
  const errorDescription =
    paymentEntity?.error_description ?? "Payment failed";

  logger.warn("Razorpay webhook: payment failed", {
    errorCode,
    errorDescription,
  });

  // The subscription tier remains unchanged (Requirement 9.5)
  // The client UI will show the error and retry option
}

/**
 * Razorpay webhook event type definitions.
 */
interface RazorpayWebhookEvent {
  event: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        plan_id?: string;
        status?: string;
        current_start?: number;
        current_end?: number;
      };
    };
    payment?: {
      entity?: {
        id?: string;
        status?: string;
        error_code?: string;
        error_description?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        status?: string;
        notes?: { workspaceId?: string };
      };
    };
  };
}
