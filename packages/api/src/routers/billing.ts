import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BillingTier } from "@shipflow/database";
import { Permission } from "@shipflow/auth/server";
import {
  createTRPCRouter,
  workspaceProcedure,
  roleGuardedProcedure,
} from "../trpc";
import {
  getOrCreateSubscription,
  getCurrentUsage,
  checkUsageLimit,
  TIER_LIMITS,
  USAGE_TYPES,
} from "../services/billing";
import {
  getRazorpayClient,
  createRazorpayCustomer,
  createRazorpayPaymentLink,
  cancelRazorpaySubscription,
} from "../services/razorpay";

/**
 * Billing tRPC router.
 * Manages subscription plans, usage tracking, and payment processing.
 *
 * Requirements: 9.1, 9.2, 9.6
 */
export const billingRouter = createTRPCRouter({
  /**
   * Get the current subscription plan for a workspace.
   * Any workspace member can view the current plan.
   *
   * Requirement: 9.1, 9.6
   */
  getCurrentPlan: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const subscription = await getOrCreateSubscription(
        ctx.db,
        input.workspaceId
      );

      // Whether Razorpay billing is fully configured in this environment.
      // Requires API credentials AND a Pro plan ID — all three must be present
      // for the upgrade flow to work end-to-end.
      const billingConfigured =
        !!process.env.RAZORPAY_KEY_ID &&
        !!process.env.RAZORPAY_KEY_SECRET &&
        !!process.env.RAZORPAY_PRO_PLAN_ID;

      return {
        id: subscription.id,
        tier: subscription.tier,
        aiReviewCredits: subscription.aiReviewCredits,
        maxRepositories: subscription.maxRepositories,
        billingCycleStart: subscription.billingCycleStart,
        billingCycleEnd: subscription.billingCycleEnd,
        nextRenewalDate: subscription.nextRenewalDate,
        cancelledAt: subscription.cancelledAt,
        razorpaySubId: subscription.razorpaySubId,
        billingConfigured,
      };
    }),

  /**
   * Get current usage for a workspace within the active billing cycle.
   * Any workspace member can view usage information.
   *
   * Requirement: 9.2, 9.6
   */
  getUsage: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const subscription = await getOrCreateSubscription(
        ctx.db,
        input.workspaceId
      );

      const aiReviewUsage = await getCurrentUsage(
        ctx.db,
        input.workspaceId,
        USAGE_TYPES.AI_REVIEW,
        subscription.billingCycleStart,
        subscription.billingCycleEnd
      );

      const repoCount = await ctx.db.repository.count({
        where: {
          project: {
            workspaceId: input.workspaceId,
          },
        },
      });

      return {
        aiReviews: {
          used: aiReviewUsage,
          limit: subscription.aiReviewCredits,
          remaining: Math.max(0, subscription.aiReviewCredits - aiReviewUsage),
        },
        repositories: {
          used: repoCount,
          limit: subscription.maxRepositories,
          remaining: Math.max(0, subscription.maxRepositories - repoCount),
        },
        billingCycle: {
          start: subscription.billingCycleStart,
          end: subscription.billingCycleEnd,
        },
      };
    }),

  /**
   * Create a checkout session for upgrading to Pro tier.
   * Only workspace admins (MANAGE_BILLING permission) can initiate checkout.
   *
   * Requirements: 9.4, 9.5
   */
  createCheckout: roleGuardedProcedure(Permission.MANAGE_BILLING)
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const subscription = await getOrCreateSubscription(
        ctx.db,
        input.workspaceId
      );

      // Gracefully no-op when billing isn't configured in this environment,
      // so the client never sees a thrown error for an expected dev state.
      // Payment Links only need API credentials (no recurring plan).
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return {
          configured: false as const,
          message: "Billing is not configured in this environment.",
        };
      }

      if (subscription.tier === BillingTier.PRO && !subscription.cancelledAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workspace is already on the Pro plan.",
        });
      }

      try {
        const workspace = await ctx.db.workspace.findUnique({
          where: { id: input.workspaceId },
        });

        // Ensure a Razorpay customer exists (stored for future billing ops).
        let customerId = subscription.razorpayCustomerId;
        if (!customerId) {
          customerId = await createRazorpayCustomer(
            ctx.session.user.email,
            workspace?.name || "Workspace"
          );
          if (customerId) {
            await ctx.db.billingSubscription.update({
              where: { workspaceId: input.workspaceId },
              data: { razorpayCustomerId: customerId },
            });
          }
        }

        // Pro price in the smallest currency unit (paise for INR). Defaults to
        // ₹4,999. Override with RAZORPAY_PRO_AMOUNT / RAZORPAY_CURRENCY.
        const amount = Number(process.env.RAZORPAY_PRO_AMOUNT ?? 499900);
        const currency = process.env.RAZORPAY_CURRENCY ?? "INR";
        const appUrl =
          process.env.BETTER_AUTH_URL ??
          process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
          "http://localhost:3000";

        // Create a one-time Razorpay Payment Link. Unlike the Subscriptions
        // API, this works without the recurring-payments feature enabled on the
        // merchant account, and returns a hosted short_url for the client.
        const paymentLink = await createRazorpayPaymentLink({
          email: ctx.session.user.email,
          name: workspace?.name || "Workspace",
          amount,
          currency,
          workspaceId: input.workspaceId,
          callbackUrl: `${appUrl}/billing`,
        });

        // Store the pending payment link id so the webhook can match it back.
        await ctx.db.billingSubscription.update({
          where: { workspaceId: input.workspaceId },
          data: { razorpaySubId: paymentLink.id },
        });

        return {
          subscriptionId: paymentLink.id,
          checkoutUrl: paymentLink.short_url,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        // Razorpay SDK errors come as { statusCode, error: { code, description } }
        // rather than a standard Error instance — surface the real description.
        const rzpErr = error as {
          error?: { description?: string; code?: string };
          message?: string;
        };
        const detail =
          rzpErr?.error?.description ||
          rzpErr?.error?.code ||
          (error instanceof Error ? error.message : JSON.stringify(error));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Payment processing failed: ${detail}. Your current plan remains unchanged. Please try again.`,
        });
      }
    }),

  /**
   * Verify a Razorpay Payment Link after the user returns from the payment
   * page. Called by the billing page when it detects Razorpay callback params
   * in the URL. This makes the upgrade work even when the webhook isn't
   * configured.
   *
   * Requirement: 9.4
   */
  verifyPayment: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        paymentLinkId: z.string(),
        paymentId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Billing is not configured.",
        });
      }

      const subscription = await getOrCreateSubscription(
        ctx.db,
        input.workspaceId
      );

      // Already upgraded — nothing to do.
      if (subscription.tier === BillingTier.PRO && !subscription.cancelledAt) {
        return { upgraded: true, alreadyPro: true };
      }

      try {
        const razorpay = getRazorpayClient();

        // Fetch the payment link status from Razorpay API.
        const link = await (razorpay.paymentLink as any).fetch(
          input.paymentLinkId
        );
        const status: string = link?.status ?? "";

        // "paid" means the payment link has been successfully paid.
        if (status !== "paid") {
          return { upgraded: false, status };
        }

        // Upgrade the workspace to PRO.
        const now = new Date();
        const newCycleEnd = new Date(now);
        newCycleEnd.setMonth(newCycleEnd.getMonth() + 1);

        const tierLimits = TIER_LIMITS[BillingTier.PRO];

        await ctx.db.billingSubscription.update({
          where: { workspaceId: input.workspaceId },
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

        // Reset usage on upgrade.
        await ctx.db.usageLog.deleteMany({
          where: {
            workspaceId: input.workspaceId,
            periodStart: { lt: now },
          },
        });

        return { upgraded: true, alreadyPro: false };
      } catch (error) {
        const rzpErr = error as {
          error?: { description?: string };
          message?: string;
        };
        const detail =
          rzpErr?.error?.description ||
          (error instanceof Error ? error.message : "Unknown error");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Could not verify payment: ${detail}`,
        });
      }
    }),

  /**
   * Cancel the current subscription.
   * Only workspace admins (MANAGE_BILLING permission) can cancel.
   * The workspace will retain Pro access until the end of the billing cycle.
   *
   * Requirement: 9.4
   */
  cancelSubscription: roleGuardedProcedure(Permission.MANAGE_BILLING)
    .input(
      z.object({
        workspaceId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const subscription = await getOrCreateSubscription(
        ctx.db,
        input.workspaceId
      );

      if (subscription.tier === BillingTier.FREE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot cancel a free plan.",
        });
      }

      if (subscription.cancelledAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Subscription is already cancelled.",
        });
      }

      // Cancel in Razorpay if there's an active subscription
      if (subscription.razorpaySubId) {
        try {
          await cancelRazorpaySubscription(subscription.razorpaySubId, true);
        } catch (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Failed to cancel subscription with payment provider. Please try again.",
          });
        }
      }

      // Mark as cancelled - access continues until cycle end
      await ctx.db.billingSubscription.update({
        where: { workspaceId: input.workspaceId },
        data: { cancelledAt: new Date() },
      });

      return {
        message:
          "Subscription cancelled. You will retain Pro access until the end of your current billing cycle.",
        accessUntil: subscription.billingCycleEnd,
      };
    }),
});
