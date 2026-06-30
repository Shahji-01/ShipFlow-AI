"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

const PHASE_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  AI_REVIEW: "AI Review",
  HUMAN_APPROVAL: "Human Approval",
  SHIPPED: "Shipped",
  FIX_NEEDED: "Fix Needed",
};

const PHASE_ORDER = [
  "DISCOVERY",
  "PLANNING",
  "DEVELOPMENT",
  "AI_REVIEW",
  "HUMAN_APPROVAL",
  "SHIPPED",
  "FIX_NEEDED",
];

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-notion">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId } = useWorkspace();

  const { data, isLoading, error } = useQuery(
    trpc.analytics.getMetrics.queryOptions(
      { workspaceId: activeWorkspaceId ?? "", windowDays: 30 },
      { enabled: !!activeWorkspaceId }
    )
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Delivery-pipeline metrics for your workspace over the last 30 days
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {error.message}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total features"
              value={String(data.totalFeatures)}
            />
            <StatCard
              label="Shipped (30d)"
              value={String(data.shipped.inWindow)}
              sub={`${data.shipped.total} all-time`}
            />
            <StatCard
              label="Avg cycle time"
              value={`${data.shipped.avgCycleTimeDays}d`}
              sub="creation → shipped"
            />
            <StatCard
              label="AI review pass rate"
              value={`${data.reviews.passRate}%`}
              sub={`${data.reviews.completed} completed reviews`}
            />
          </div>

          {/* Features by phase */}
          <div className="rounded-xl border border-border bg-card shadow-notion">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-display text-base font-semibold text-foreground">
                Features by phase
              </h2>
            </div>
            <div className="space-y-3 p-6">
              {PHASE_ORDER.map((phase) => {
                const count = data.featuresByPhase[
                  phase as keyof typeof data.featuresByPhase
                ] as number;
                const pct =
                  data.totalFeatures > 0
                    ? Math.round((count / data.totalFeatures) * 100)
                    : 0;
                return (
                  <div key={phase} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {PHASE_LABELS[phase]}
                      </span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Review quality */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total AI reviews"
              value={String(data.reviews.total)}
            />
            <StatCard
              label="Reviews with blocking issues"
              value={String(data.reviews.withBlocking)}
            />
            <StatCard
              label="Blocking-issue rate"
              value={`${data.reviews.blockingRate}%`}
            />
          </div>
        </>
      )}
    </div>
  );
}
