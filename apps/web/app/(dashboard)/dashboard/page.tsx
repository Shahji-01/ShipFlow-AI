"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

/* ─── Phase config ────────────────────────────────────── */

const PHASES = [
  { name: "Discovery", phase: "DISCOVERY", href: "/features", color: "bg-sky-400", text: "text-sky-400" },
  { name: "Planning", phase: "PLANNING", href: "/prd", color: "bg-violet-400", text: "text-violet-400" },
  { name: "Development", phase: "DEVELOPMENT", href: "/tasks", color: "bg-amber-400", text: "text-amber-400" },
  { name: "AI Review", phase: "AI_REVIEW", href: "/reviews", color: "bg-cyan-400", text: "text-cyan-400" },
  { name: "Approval", phase: "HUMAN_APPROVAL", href: "/approvals", color: "bg-fuchsia-400", text: "text-fuchsia-400" },
  { name: "Shipped", phase: "SHIPPED", href: "/features", color: "bg-emerald-400", text: "text-emerald-400" },
  { name: "Fix Needed", phase: "FIX_NEEDED", href: "/features", color: "bg-rose-400", text: "text-rose-400" },
] as const;

function formatRelativeTime(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString();
}

/* Count-up animation (respects reduced motion via CSS globally). */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 700;
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{display}</>;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();

  const { data: stats, isLoading: statsLoading } = useQuery(
    trpc.project.stats.queryOptions(
      { workspaceId: activeWorkspaceId! },
      {
        enabled: !!activeWorkspaceId,
        // Dashboard stats update whenever a feature changes phase — poll every 10 s.
        refetchInterval: 10_000,
      }
    )
  );

  const { data: activity, isLoading: activityLoading } = useQuery(
    trpc.activity.list.queryOptions(
      { workspaceId: activeWorkspaceId!, limit: 8 },
      {
        enabled: !!activeWorkspaceId,
        // Activity feed should feel live — refresh every 10 s.
        refetchInterval: 10_000,
      }
    )
  );

  const counts = (stats ?? {}) as Record<string, number>;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const activityItems = activity?.items ?? [];
  const hasNoFeatures = !statsLoading && stats && total === 0;

  const awaitingApproval = counts.HUMAN_APPROVAL ?? 0;
  const needFix = counts.FIX_NEEDED ?? 0;
  const inReview = counts.AI_REVIEW ?? 0;
  const shipped = counts.SHIPPED ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {greeting()}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening in{" "}
            <span className="font-medium text-foreground">
              {activeWorkspace?.name ?? "your workspace"}
            </span>
            .
          </p>
        </div>
        <Link
          href="/features/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Feature
        </Link>
      </div>

      {hasNoFeatures ? (
        <EmptyState />
      ) : (
        <>
          {/* Needs your attention */}
          {(awaitingApproval > 0 || needFix > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {awaitingApproval > 0 && (
                <AttentionCard
                  href="/approvals"
                  tone="fuchsia"
                  count={awaitingApproval}
                  title={`${awaitingApproval} feature${awaitingApproval > 1 ? "s" : ""} awaiting approval`}
                  sub="Review and approve to ship."
                />
              )}
              {needFix > 0 && (
                <AttentionCard
                  href="/features"
                  tone="rose"
                  count={needFix}
                  title={`${needFix} feature${needFix > 1 ? "s" : ""} need fixes`}
                  sub="AI review flagged blocking issues."
                />
              )}
            </div>
          )}

          {/* Stat strip */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total features" value={total} loading={statsLoading} />
            <StatCard label="In AI review" value={inReview} loading={statsLoading} accent="text-cyan-400" />
            <StatCard label="Awaiting approval" value={awaitingApproval} loading={statsLoading} accent="text-fuchsia-400" />
            <StatCard label="Shipped" value={shipped} loading={statsLoading} accent="text-emerald-400" />
          </div>

          {/* Delivery funnel */}
          <section className="rounded-2xl border border-border bg-card p-6 shadow-notion">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-foreground">
                Delivery pipeline
              </h2>
              <span className="text-xs text-muted-foreground">{total} total</span>
            </div>
            {statsLoading ? (
              <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
            ) : (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
                  {PHASES.map((p) => {
                    const c = counts[p.phase] ?? 0;
                    const pct = total > 0 ? (c / total) * 100 : 0;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={p.phase}
                        className={`${p.color} h-full transition-all`}
                        style={{ width: `${pct}%` }}
                        title={`${p.name}: ${c}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 lg:grid-cols-7">
                  {PHASES.map((p) => (
                    <Link
                      key={p.phase}
                      href={p.href}
                      className="group flex items-center gap-2 text-xs"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${p.color}`} />
                      <span className="truncate text-muted-foreground group-hover:text-foreground">
                        {p.name}
                      </span>
                      <span className="ml-auto font-medium text-foreground">
                        {counts[p.phase] ?? 0}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Quick actions + activity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
            <section className="rounded-2xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Quick actions
                </h2>
              </div>
              <div className="space-y-2.5 p-4">
                {quickActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="group flex items-center gap-3 rounded-xl border border-transparent p-3 text-sm transition-all hover:border-border hover:bg-secondary/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      {a.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{a.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Recent activity
                </h2>
              </div>
              <div className="p-6">
                {activityLoading || !activeWorkspaceId ? (
                  <div className="space-y-5">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-4">
                        <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityItems.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No recent activity yet
                  </div>
                ) : (
                  <div className="relative space-y-5 before:absolute before:bottom-2 before:left-[3px] before:top-2 before:w-px before:bg-border">
                    {activityItems.map((item) => (
                      <div key={item.id} className="relative flex items-start gap-4 text-sm">
                        <div className="relative z-10 mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary ring-4 ring-card" />
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground">
                            {item.actor?.name && (
                              <span className="font-medium">{item.actor.name} </span>
                            )}
                            <span className="text-muted-foreground">{item.message}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            {formatRelativeTime(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────── */

function StatCard({
  label,
  value,
  loading,
  accent = "text-foreground",
}: {
  label: string;
  value: number;
  loading?: boolean;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-notion transition-colors hover:border-primary/30">
      {loading ? (
        <>
          <div className="h-8 w-12 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
        </>
      ) : (
        <>
          <p className={`font-display text-3xl font-semibold tracking-tight ${accent}`}>
            <AnimatedNumber value={value} />
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
        </>
      )}
    </div>
  );
}

const toneStyles: Record<string, string> = {
  fuchsia: "border-fuchsia-500/30 bg-fuchsia-500/[0.07] hover:bg-fuchsia-500/[0.12]",
  rose: "border-rose-500/30 bg-rose-500/[0.07] hover:bg-rose-500/[0.12]",
};
const toneIcon: Record<string, string> = {
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-400",
  rose: "bg-rose-500/15 text-rose-400",
};

function AttentionCard({
  href,
  tone,
  count,
  title,
  sub,
}: {
  href: string;
  tone: "fuchsia" | "rose";
  count: number;
  title: string;
  sub: string;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${toneStyles[tone]}`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${toneIcon[tone]}`}>
        {count}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-notion">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <h2 className="mt-5 font-display text-xl font-semibold text-foreground">
        Let&apos;s ship your first feature
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Drop in a rough idea. ShipFlow drafts the PRD, breaks it into tasks,
        reviews the code with AI, and gates the release behind your approval.
      </p>
      <Link
        href="/features/new"
        className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg"
      >
        Create your first feature
      </Link>
    </div>
  );
}

const quickActions: {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}[] = [
  {
    label: "New feature request",
    description: "Capture an idea and start the flow",
    href: "/features/new",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    ),
  },
  {
    label: "Task board",
    description: "Track development work",
    href: "/tasks",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
    ),
  },
  {
    label: "AI reviews",
    description: "See the QA agent's findings",
    href: "/reviews",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
    ),
  },
  {
    label: "Connect a repository",
    description: "Link GitHub for PR tracking",
    href: "/github",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /></svg>
    ),
  },
];

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,6 15,12 9,18" />
    </svg>
  );
}
