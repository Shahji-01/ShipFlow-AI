"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

/* ─── helpers ──────────────────────────────────────────── */

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

/* ─── plan feature matrix ───────────────────────────────── */

const FREE_FEATURES = [
  "Up to 10 AI code reviews / month",
  "2 connected repositories",
  "PRD generation & task planning",
  "Feature lifecycle tracking",
  "Team workspace & roles",
];

const PRO_FEATURES = [
  "Unlimited AI code reviews",
  "Unlimited repositories",
  "Priority AI processing",
  "Advanced analytics",
  "Custom review guidelines per project",
  "Slack webhook notifications",
  "Everything in Free",
];

/* ─── main page ─────────────────────────────────────────── */

export default function BillingPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const isAdmin = activeWorkspace?.role === "ADMIN";
  const enabled = !!activeWorkspaceId;

  const { data: plan, isLoading: planLoading, isError: planError } = useQuery(
    trpc.billing.getCurrentPlan.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled, refetchInterval: 15_000 }
    )
  );

  const { data: usage, isLoading: usageLoading, isError: usageError } = useQuery(
    trpc.billing.getUsage.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled, refetchInterval: 15_000 }
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

  const verifyPayment = useMutation(
    trpc.billing.verifyPayment.mutationOptions({
      onSuccess: (result) => {
        if (result.upgraded) {
          invalidateBilling();
          // Remove Razorpay params from the URL so the banner doesn't re-trigger.
          router.replace("/billing");
        }
      },
    })
  );

  // When Razorpay redirects back with payment_link_id, verify the payment
  // immediately — this upgrades the workspace even without a webhook.
  React.useEffect(() => {
    const linkId = searchParams.get("razorpay_payment_link_id");
    const paymentId = searchParams.get("razorpay_payment_id") ?? undefined;
    if (!linkId || !activeWorkspaceId) return;
    if (verifyPayment.isPending || verifyPayment.isSuccess) return;
    verifyPayment.mutate({
      workspaceId: activeWorkspaceId,
      paymentLinkId: linkId,
      paymentId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeWorkspaceId]);

  const cancelSubscription = useMutation(
    trpc.billing.cancelSubscription.mutationOptions({ onSuccess: invalidateBilling })
  );

  const isPro = plan?.tier === "PRO";
  const isCancelled = !!plan?.cancelledAt;
  const billingConfigured =
    (plan as { billingConfigured?: boolean } | undefined)?.billingConfigured ?? false;

  React.useEffect(() => {
    if (!billingConfigured && createCheckout.isError) createCheckout.reset();
  }, [billingConfigured, createCheckout]);

  const resetDays = daysUntil(plan?.billingCycleEnd);

  if (!activeWorkspaceId) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Select a workspace to view billing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Payment verification banner — shown when returning from Razorpay */}
      {verifyPayment.isPending && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
          Verifying your payment… please wait.
        </div>
      )}
      {verifyPayment.isSuccess && verifyPayment.data?.upgraded && !verifyPayment.data?.alreadyPro && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Payment confirmed! Your workspace has been upgraded to Pro. 🎉
        </div>
      )}
      {verifyPayment.isError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {verifyPayment.error?.message ?? "Could not verify payment. Your plan will update shortly."}
        </div>
      )}

      {/* ── Current plan banner ── */}
      <div className={`relative overflow-hidden rounded-2xl border p-6 ${
        isPro
          ? "border-primary/30 bg-gradient-to-br from-primary/10 via-teal-500/5 to-transparent"
          : "border-border bg-card"
      }`}>
        {isPro && (
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        )}
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Plan badge + info */}
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold shadow-inner ${
              isPro
                ? "bg-gradient-to-br from-primary to-teal-400 text-white shadow-primary/25"
                : "border border-border bg-secondary text-foreground"
            }`}>
              {isPro ? "Pro" : "Free"}
            </div>
            <div>
              {planLoading ? (
                <div className="space-y-2">
                  <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                </div>
              ) : planError || !plan ? (
                <p className="text-sm text-destructive">Failed to load plan details.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-semibold text-foreground">
                      {isPro ? "Pro plan" : "Free plan"}
                    </h2>
                    {isCancelled && (
                      <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        Cancelling
                      </span>
                    )}
                    {!isPro && (
                      <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Current plan
                      </span>
                    )}
                    {isPro && !isCancelled && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {isPro ? "₹4,999 / month" : "₹0 / month · limited usage"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Cycle: {formatDate(plan.billingCycleStart)} → {formatDate(plan.billingCycleEnd)}</span>
                    {resetDays !== null && (
                      <span className={resetDays <= 5 ? "text-warning" : ""}>
                        Resets in {resetDays} day{resetDays !== 1 ? "s" : ""}
                      </span>
                    )}
                    {isCancelled && (
                      <span className="text-warning">
                        Pro access until {formatDate(plan.billingCycleEnd)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          {isAdmin && !planLoading && plan && (
            <div className="flex shrink-0 items-center gap-2">
              {!isPro && (
                <button
                  onClick={() => createCheckout.mutate({ workspaceId: activeWorkspaceId })}
                  disabled={createCheckout.isPending || !billingConfigured}
                  title={billingConfigured ? undefined : "Billing isn't configured in this environment"}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {createCheckout.isPending ? (
                    <><Spinner className="h-4 w-4" /> Processing…</>
                  ) : "Upgrade to Pro"}
                </button>
              )}
              {isPro && !isCancelled && (
                <button
                  onClick={() => cancelSubscription.mutate({ workspaceId: activeWorkspaceId })}
                  disabled={cancelSubscription.isPending}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-destructive/30 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  {cancelSubscription.isPending ? "Cancelling…" : "Cancel subscription"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Error / info banners */}
        {!billingConfigured && !isPro && (
          <div className="mt-4 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            Payments aren&apos;t configured in this environment — set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">RAZORPAY_PRO_PLAN_ID</code>{" "}
            and Razorpay keys to enable upgrades. Free plan has full functionality.
          </div>
        )}
        {billingConfigured && createCheckout.isError && (
          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{createCheckout.error.message}</p>
            <Button size="sm" variant="outline"
              className="mt-2 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => createCheckout.mutate({ workspaceId: activeWorkspaceId })}
              disabled={createCheckout.isPending}>
              Retry Payment
            </Button>
          </div>
        )}
        {cancelSubscription.isError && (
          <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{cancelSubscription.error.message}</p>
          </div>
        )}
      </div>

      {/* ── Usage this cycle ── */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Usage This Cycle</h2>
            {resetDays !== null && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Resets {formatDate(plan?.billingCycleEnd)}
                {resetDays <= 5 && (
                  <span className="ml-1.5 font-medium text-warning">({resetDays}d left)</span>
                )}
              </p>
            )}
          </div>
          {isPro && (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Pro — unlimited
            </span>
          )}
        </div>

        {usageLoading ? (
          <div className="space-y-5">
            <UsageSkeleton /><UsageSkeleton />
          </div>
        ) : usageError || !usage ? (
          <p className="text-sm text-destructive">Failed to load usage data.</p>
        ) : (
          <div className="space-y-5">
            <UsageBar label="AI Reviews" icon="review"
              used={usage.aiReviews.used} limit={usage.aiReviews.limit}
              remaining={usage.aiReviews.remaining} isPro={isPro} />
            <UsageBar label="Repositories" icon="repo"
              used={usage.repositories.used} limit={usage.repositories.limit}
              remaining={usage.repositories.remaining} isPro={isPro} />
          </div>
        )}

        {/* Limit warning */}
        {!isPro && !usageLoading && usage && (() => {
          const aiReached = usage.aiReviews.limit > 0 && usage.aiReviews.used >= usage.aiReviews.limit;
          const repoReached = usage.repositories.limit > 0 && usage.repositories.used >= usage.repositories.limit;
          const aiNear = !aiReached && usage.aiReviews.limit > 0 && usage.aiReviews.used / usage.aiReviews.limit >= 0.8;
          const repoNear = !repoReached && usage.repositories.limit > 0 && usage.repositories.used / usage.repositories.limit >= 0.8;
          const reached = aiReached || repoReached;
          const near = aiNear || repoNear;
          if (!reached && !near) return null;
          const which = [aiReached || aiNear ? "AI reviews" : null, repoReached || repoNear ? "repositories" : null].filter(Boolean).join(" and ");
          return (
            <div className={`mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${reached ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
              <div className="flex items-start gap-3">
                <svg className={`mt-0.5 h-5 w-5 shrink-0 ${reached ? "text-destructive" : "text-warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {reached ? `Limit reached for ${which}` : `Approaching limit for ${which}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {reached ? "Further usage is blocked until the cycle resets. Upgrade to Pro for unlimited access." : "Upgrade to Pro to avoid interruptions."}
                  </p>
                </div>
              </div>
              {isAdmin ? (
                <button onClick={() => createCheckout.mutate({ workspaceId: activeWorkspaceId })}
                  disabled={createCheckout.isPending || !billingConfigured}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition-all hover:opacity-90 disabled:opacity-50">
                  {createCheckout.isPending ? "Processing…" : "Upgrade to Pro"}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">Ask an admin to upgrade.</span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Plan comparison ── */}
      <div>
        <h2 className="font-display mb-4 text-base font-semibold text-foreground">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Free */}
          <div className={`relative rounded-2xl border p-6 ${!isPro ? "border-primary/30 bg-card ring-1 ring-primary/20" : "border-border bg-card/60"}`}>
            {!isPro && (
              <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Current plan
              </span>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary text-sm font-bold text-foreground">
              F
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold text-foreground">Free</h3>
            <p className="mt-0.5 text-2xl font-bold text-foreground">₹0<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
            <p className="mt-1 text-xs text-muted-foreground">No credit card required</p>
            <ul className="mt-5 space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            {isPro && isAdmin && (
              <p className="mt-5 text-xs text-muted-foreground">Cancel your Pro plan to return to Free.</p>
            )}
          </div>

          {/* Pro */}
          <div className={`relative rounded-2xl border p-6 ${isPro ? "border-primary/40 bg-gradient-to-br from-primary/10 via-teal-500/5 to-transparent ring-1 ring-primary/20" : "border-border bg-card"}`}>
            {isPro && (
              <span className="absolute right-4 top-4 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                Current plan
              </span>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-400 text-sm font-bold text-white shadow-glow">
              P
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold text-foreground">Pro</h3>
            <p className="mt-0.5 text-2xl font-bold text-foreground">₹4,999<span className="text-sm font-normal text-muted-foreground"> / month</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Everything you need to ship faster</p>
            <ul className="mt-5 space-y-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            {!isPro && isAdmin && (
              <button
                onClick={() => createCheckout.mutate({ workspaceId: activeWorkspaceId })}
                disabled={createCheckout.isPending || !billingConfigured}
                title={billingConfigured ? undefined : "Billing isn't configured in this environment"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-gradient py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {createCheckout.isPending ? <><Spinner className="h-4 w-4" /> Processing…</> : "Upgrade to Pro"}
              </button>
            )}
            {!isPro && !isAdmin && (
              <p className="mt-5 text-xs text-muted-foreground">Ask a workspace admin to upgrade.</p>
            )}
            {isPro && !isCancelled && isAdmin && (
              <button
                onClick={() => cancelSubscription.mutate({ workspaceId: activeWorkspaceId })}
                disabled={cancelSubscription.isPending}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl border border-destructive/30 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {cancelSubscription.isPending ? "Cancelling…" : "Cancel subscription"}
              </button>
            )}
            {isCancelled && (
              <div className="mt-5 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
                Cancels {formatDate(plan?.billingCycleEnd)} — you keep Pro until then.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── sub-components ────────────────────────────────────── */

function PageHeader() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Billing &amp; Usage
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your subscription and monitor your usage
      </p>
    </div>
  );
}

function UsageBar({
  label, icon, used, limit, remaining, isPro,
}: {
  label: string; icon: "review" | "repo";
  used: number; limit: number; remaining: number; isPro: boolean;
}) {
  const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const isNear = percentage >= 80;
  const isReached = percentage >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon === "review" ? (
            <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            </svg>
          )}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className={`text-sm tabular-nums ${isReached ? "font-semibold text-destructive" : isNear ? "font-semibold text-warning" : "text-muted-foreground"}`}>
          {isPro ? `${used.toLocaleString()} used` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isPro && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                isReached ? "bg-destructive" : isNear ? "bg-gradient-to-r from-warning to-amber-400" : "bg-brand-gradient"
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={isReached ? "text-destructive" : isNear ? "text-warning" : ""}>{percentage}% used</span>
            <span>{remaining.toLocaleString()} remaining</span>
          </div>
        </>
      )}
      {isPro && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-2 w-full rounded-full bg-brand-gradient opacity-30" />
        </div>
      )}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}
