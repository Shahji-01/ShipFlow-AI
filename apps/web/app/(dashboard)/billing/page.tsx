"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BillingPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const isAdmin = activeWorkspace?.role === "ADMIN";

  const enabled = !!activeWorkspaceId;

  const {
    data: plan,
    isLoading: planLoading,
    isError: planError,
  } = useQuery(
    trpc.billing.getCurrentPlan.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled }
    )
  );

  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
  } = useQuery(
    trpc.billing.getUsage.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled }
    )
  );

  function invalidateBilling() {
    qc.invalidateQueries({ queryKey: trpc.billing.getCurrentPlan.queryKey() });
    qc.invalidateQueries({ queryKey: trpc.billing.getUsage.queryKey() });
  }

  const createCheckout = useMutation(
    trpc.billing.createCheckout.mutationOptions({
      onSuccess: (result) => {
        if (result && "checkoutUrl" in result && result.checkoutUrl) {
          window.open(result.checkoutUrl, "_blank");
        }
        invalidateBilling();
      },
    })
  );

  const cancelSubscription = useMutation(
    trpc.billing.cancelSubscription.mutationOptions({
      onSuccess: invalidateBilling,
    })
  );

  const isPro = plan?.tier === "PRO";
  const isCancelled = !!plan?.cancelledAt;
  const billingConfigured =
    (plan as { billingConfigured?: boolean } | undefined)?.billingConfigured ??
    false;

  // ── No workspace selected ───────────────────────────────────────────────
  if (!activeWorkspaceId) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <Card className="border border-border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Select a workspace to view billing and usage.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Current Plan */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg">Current Plan</CardTitle>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {!isPro && (
                  <Button
                    size="sm"
                    className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                    onClick={() =>
                      createCheckout.mutate({ workspaceId: activeWorkspaceId })
                    }
                    disabled={createCheckout.isPending || !billingConfigured}
                    title={
                      billingConfigured
                        ? undefined
                        : "Billing isn't configured in this environment"
                    }
                  >
                    {createCheckout.isPending ? "Processing..." : "Upgrade to Pro"}
                  </Button>
                )}
                {isPro && !isCancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      cancelSubscription.mutate({ workspaceId: activeWorkspaceId })
                    }
                    disabled={cancelSubscription.isPending}
                  >
                    {cancelSubscription.isPending
                      ? "Cancelling..."
                      : "Cancel subscription"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {planLoading ? (
            <div className="flex items-center gap-4">
              <div className="h-14 w-28 animate-pulse rounded-xl bg-muted" />
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-48 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ) : planError || !plan ? (
            <p className="text-sm text-destructive">
              Failed to load plan details. Please try again.
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/15 to-teal-500/10 px-5 py-3">
                <span className="bg-gradient-to-r from-primary to-teal-400 bg-clip-text font-display text-xl font-bold text-transparent">
                  {plan.tier === "PRO" ? "Pro" : "Free"}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {plan.tier === "PRO" ? "₹4,999/month" : "Free plan"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Billing cycle: {formatDate(plan.billingCycleStart)} →{" "}
                  {formatDate(plan.billingCycleEnd)}
                </p>
                {isCancelled ? (
                  <p className="text-xs text-warning">
                    Cancelled · Pro access until {formatDate(plan.billingCycleEnd)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Next renewal: {formatDate(plan.nextRenewalDate)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Billing not configured — informational, not an error */}
          {!billingConfigured && !isPro && (
            <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-4">
              <p className="text-sm text-muted-foreground">
                Paid plans aren&apos;t configured in this environment. Set
                <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">RAZORPAY_PRO_PLAN_ID</code>
                (and Razorpay keys) to enable upgrades. You&apos;re on the Free
                plan with full functionality.
              </p>
            </div>
          )}

          {/* Payment / mutation errors */}
          {billingConfigured && createCheckout.isError && (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                {createCheckout.error.message}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() =>
                  createCheckout.mutate({ workspaceId: activeWorkspaceId })
                }
                disabled={createCheckout.isPending}
              >
                Retry Payment
              </Button>
            </div>
          )}
          {cancelSubscription.isError && (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                {cancelSubscription.error.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Section */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display text-lg">Usage This Cycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {usageLoading ? (
            <>
              <UsageSkeleton />
              <UsageSkeleton />
            </>
          ) : usageError || !usage ? (
            <p className="text-sm text-destructive">
              Failed to load usage data. Please try again.
            </p>
          ) : (
            <>
              <UsageBar
                label="AI Reviews"
                used={usage.aiReviews.used}
                limit={usage.aiReviews.limit}
                remaining={usage.aiReviews.remaining}
              />
              <UsageBar
                label="Repositories"
                used={usage.repositories.used}
                limit={usage.repositories.limit}
                remaining={usage.repositories.remaining}
              />
              {!isPro &&
                (() => {
                  const aiReached =
                    usage.aiReviews.limit > 0 &&
                    usage.aiReviews.used >= usage.aiReviews.limit;
                  const repoReached =
                    usage.repositories.limit > 0 &&
                    usage.repositories.used >= usage.repositories.limit;
                  const aiNear =
                    !aiReached &&
                    usage.aiReviews.limit > 0 &&
                    usage.aiReviews.used / usage.aiReviews.limit >= 0.8;
                  const repoNear =
                    !repoReached &&
                    usage.repositories.limit > 0 &&
                    usage.repositories.used / usage.repositories.limit >= 0.8;
                  const reached = aiReached || repoReached;
                  const near = aiNear || repoNear;
                  if (!reached && !near) return null;

                  const which = [
                    aiReached || aiNear ? "AI reviews" : null,
                    repoReached || repoNear ? "repositories" : null,
                  ]
                    .filter(Boolean)
                    .join(" and ");

                  return (
                    <div
                      className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                        reached
                          ? "border-destructive/30 bg-destructive/10"
                          : "border-warning/30 bg-warning/10"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <svg
                          className={`mt-0.5 h-5 w-5 shrink-0 ${reached ? "text-destructive" : "text-warning"}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {reached
                              ? `You've reached your Free plan limit for ${which}.`
                              : `You're close to your Free plan limit for ${which}.`}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {reached
                              ? "Further usage is blocked until your cycle resets. Upgrade to Pro for higher limits and more AI review credits."
                              : "Upgrade to Pro for higher limits before you run out."}
                          </p>
                        </div>
                      </div>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          className="shrink-0 bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                          onClick={() =>
                            createCheckout.mutate({ workspaceId: activeWorkspaceId })
                          }
                          disabled={createCheckout.isPending || !billingConfigured}
                          title={
                            billingConfigured
                              ? undefined
                              : "Billing isn't configured in this environment"
                          }
                        >
                          {createCheckout.isPending ? "Processing..." : "Upgrade to Pro"}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Ask a workspace admin to upgrade.
                        </span>
                      )}
                    </div>
                  );
                })()}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Billing &amp; Usage
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your subscription and monitor usage
      </p>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used: number;
  limit: number;
  remaining: number;
}) {
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const isNearLimit = percentage >= 80;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-2.5 rounded-full transition-all ${
            isNearLimit
              ? "bg-gradient-to-r from-warning to-amber-400"
              : "bg-brand-gradient"
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className={isNearLimit ? "text-warning" : ""}>{percentage}% used</span>
        <span>{remaining.toLocaleString()} remaining</span>
      </div>
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-2.5 w-full animate-pulse rounded-full bg-muted" />
    </div>
  );
}
