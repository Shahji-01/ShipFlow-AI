"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../../lib/trpc-react";
import { useWorkspace } from "../../../../lib/workspace-context";

const phaseConfig: Record<string, { label: string; className: string }> = {
  DISCOVERY: {
    label: "Product Discovery",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  },
  PLANNING: {
    label: "Planning",
    className: "border-violet-500/20 bg-violet-500/10 text-violet-400",
  },
  DEVELOPMENT: {
    label: "Development",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  },
  AI_REVIEW: {
    label: "AI Review",
    className: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400",
  },
  HUMAN_APPROVAL: {
    label: "Human Approval",
    className: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  },
  SHIPPED: {
    label: "Shipped",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  },
  FIX_NEEDED: {
    label: "Fix Needed",
    className: "border-rose-500/20 bg-rose-500/10 text-rose-400",
  },
};

const missingElementLabels: Record<string, string> = {
  problem_statement: "Problem statement",
  user_impact: "User impact",
  desired_outcome: "Desired outcome",
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* Persistent lifecycle stepper shown at the top of the feature. */
const LIFECYCLE = [
  { key: "DISCOVERY", label: "Discovery" },
  { key: "PLANNING", label: "Planning" },
  { key: "DEVELOPMENT", label: "Development" },
  { key: "AI_REVIEW", label: "AI Review" },
  { key: "HUMAN_APPROVAL", label: "Approval" },
  { key: "SHIPPED", label: "Shipped" },
] as const;

function PhaseStepper({ phase }: { phase: string }) {
  const isFix = phase === "FIX_NEEDED";
  const currentIndex = isFix
    ? LIFECYCLE.findIndex((s) => s.key === "DEVELOPMENT")
    : LIFECYCLE.findIndex((s) => s.key === phase);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-notion">
      {isFix && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-medium text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          Changes requested by AI review — back in development.
        </p>
      )}
      <ol className="flex flex-wrap items-center gap-y-2" aria-label="Feature lifecycle">
        {LIFECYCLE.map((s, i) => {
          const done = currentIndex >= 0 && i < currentIndex;
          const active = i === currentIndex;
          return (
            <React.Fragment key={s.key}>
              <li
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border border-primary/40 bg-primary/15 text-primary"
                    : done
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {done ? (
                  <svg className="h-3 w-3 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] ${
                      active ? "bg-primary text-primary-foreground" : "bg-border text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                )}
                {s.label}
              </li>
              {i < LIFECYCLE.length - 1 && (
                <span
                  className={`mx-0.5 h-px w-3 shrink-0 sm:w-5 ${done ? "bg-primary" : "bg-border"}`}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
}

type AnalysisResult = {
  isComplete: boolean;
  missingElements: string[];
  questions: string[];
  isDuplicate: boolean;
  duplicateGuidance: string | null;
  clarificationIds?: string[];
};

/* ── PRD generation live progress ────────────────────────────────────────── */

type WorkflowStatusData = {
  id: string;
  status: string;
  currentStep: string | null;
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  elapsedMs: number;
  error: string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
};

/* Backend step names (packages/inngest/.../prd-generation.ts) → display copy. */
const PRD_STEPS = [
  {
    key: "analyze-feature-request",
    label: "Analyze feature request",
    desc: "Reading the request and clarifications",
  },
  {
    key: "check-clarification-complete",
    label: "Check clarifications",
    desc: "Confirming every question is answered",
  },
  {
    key: "generate-prd",
    label: "Draft the PRD",
    desc: "Writing the document with AI",
  },
  {
    key: "validate-prd-sections",
    label: "Validate sections",
    desc: "Checking each section is complete",
  },
  {
    key: "save-prd",
    label: "Save & advance",
    desc: "Persisting the PRD and moving to Planning",
  },
] as const;

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/* Live-ticking elapsed timer while a workflow is running. */
function useLiveElapsed(
  startedAt: Date | string | null,
  active: boolean,
  fallbackMs: number
): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  if (!startedAt) return fallbackMs;
  return active ? now - new Date(startedAt).getTime() : fallbackMs;
}

function StepIcon({ state }: { state: "done" | "active" | "failed" | "pending"; }) {
  if (state === "done") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-secondary text-[10px] font-medium text-muted-foreground/70">
      •
    </span>
  );
}

function PrdGenerationProgress({
  workflow,
  starting,
  onRetry,
  retrying,
  featureRequestId,
}: {
  workflow: WorkflowStatusData | null;
  starting: boolean;
  onRetry: () => void;
  retrying: boolean;
  featureRequestId: string;
}) {
  const status = workflow?.status ?? (starting ? "PENDING" : "PENDING");
  const isRunning = status === "RUNNING" || status === "PENDING";
  const isFailed = status === "FAILED";
  const isComplete = status === "COMPLETED";
  const completedSteps = isComplete
    ? PRD_STEPS.length
    : workflow?.completedSteps ?? 0;

  const elapsed = useLiveElapsed(
    workflow?.startedAt ?? null,
    isRunning && !!workflow,
    workflow?.elapsedMs ?? 0
  );

  const percent = isComplete
    ? 100
    : Math.max(
        workflow?.percentComplete ?? 0,
        // Nudge the bar a touch while the long AI step runs.
        isRunning ? Math.round((completedSteps / PRD_STEPS.length) * 100) : 0
      );

  const statusBadge = isComplete
    ? { label: "Completed", className: "border-success/30 bg-success/10 text-success" }
    : isFailed
      ? { label: "Failed", className: "border-destructive/30 bg-destructive/10 text-destructive" }
      : { label: "Running", className: "border-primary/30 bg-primary/10 text-primary" };

  return (
    <div className="space-y-5">
      {/* Header: status + elapsed + progress bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusBadge.className}`}>
            {isRunning && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
              </svg>
            )}
            {statusBadge.label}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)} elapsed
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              isFailed ? "bg-destructive" : "bg-brand-gradient"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Vertical stepper */}
      <ol className="space-y-1">
        {PRD_STEPS.map((s, i) => {
          let state: "done" | "active" | "failed" | "pending";
          if (isComplete || i < completedSteps) state = "done";
          else if (i === completedSteps && isFailed) state = "failed";
          else if (i === completedSteps && isRunning) state = "active";
          else state = "pending";

          return (
            <li key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon state={state} />
                {i < PRD_STEPS.length - 1 && (
                  <span
                    className={`my-0.5 w-px flex-1 ${
                      i < completedSteps ? "bg-success/40" : "bg-border"
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className={`pb-3 ${state === "pending" ? "opacity-50" : ""}`}>
                <p
                  className={`text-sm font-medium ${
                    state === "active"
                      ? "text-primary"
                      : state === "failed"
                        ? "text-destructive"
                        : "text-foreground"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Failure + retry */}
      {isFailed && (
        <div className="space-y-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {workflow?.error ?? "PRD generation failed."}
          </p>
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            {retrying ? "Retrying..." : "Retry generation"}
          </button>
        </div>
      )}

      {/* Completed */}
      {isComplete && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-success/20 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-success">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            PRD generated in {formatElapsed(workflow?.elapsedMs ?? elapsed)}.
          </p>
          <Link
            href={`/prd/${featureRequestId}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View PRD
          </Link>
        </div>
      )}
    </div>
  );
}

export default function FeatureDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : params.id?.[0] ?? "";

  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [prdStarted, setPrdStarted] = useState(false);
  const [aiAnsweringId, setAiAnsweringId] = useState<string | null>(null);

  const {
    data: feature,
    isLoading,
    error,
  } = useQuery(
    trpc.featureRequest.getById.queryOptions(
      { workspaceId: activeWorkspaceId!, id },
      {
        enabled: !!activeWorkspaceId && !!id,
        // Poll every 8 s so the phase stepper, clarifications, and PRD status
        // update live as Inngest workflows run in the background.
        refetchInterval: 8_000,
      }
    )
  );

  const analyze = useMutation(
    trpc.featureRequest.analyze.mutationOptions({
      onSuccess: (result) => {
        setAnalysis(result as AnalysisResult);
        qc.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey(),
        });
      },
    })
  );

  const submitClarification = useMutation(
    trpc.featureRequest.submitClarification.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey(),
        });
      },
    })
  );

  const skipClarification = useMutation(
    trpc.featureRequest.skipClarification.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.featureRequest.getById.queryKey(),
        });
      },
    })
  );

  const suggestAnswer = useMutation(
    trpc.featureRequest.suggestAnswer.mutationOptions({
      onSuccess: (result, variables) => {
        const cid = (variables as { clarificationId: string }).clarificationId;
        setAnswers((prev) => ({ ...prev, [cid]: result.answer }));
        setAiAnsweringId(null);
      },
      onError: () => setAiAnsweringId(null),
    })
  );

  const triggerPRD = useMutation(
    trpc.featureRequest.triggerPRD.mutationOptions({
      onSuccess: () => {
        setPrdStarted(true);
        // Kick off polling for the workflow record Inngest is about to create.
        qc.invalidateQueries({
          queryKey: trpc.workflow.getLatestForFeature.queryKey(),
        });
      },
    })
  );

  // Live PRD generation workflow status. Polls while the workflow is running
  // (or while we're waiting for Inngest to create the record after trigger).
  const { data: prdWorkflow } = useQuery(
    trpc.workflow.getLatestForFeature.queryOptions(
      { featureRequestId: id, type: "PRD_GENERATION" },
      {
        enabled: !!id,
        refetchInterval: (query) => {
          const s = (query.state.data as { status?: string } | null | undefined)
            ?.status;
          if (s === "RUNNING" || s === "PENDING") return 1500;
          if (query.state.data == null && prdStarted) return 1500;
          return false;
        },
      }
    )
  );

  // When the workflow finishes, refresh the feature so the PRD + phase update.
  const lastWorkflowStatus = useRef<string | null>(null);
  useEffect(() => {
    const status = prdWorkflow?.status ?? null;
    if (
      status &&
      status !== lastWorkflowStatus.current &&
      (status === "COMPLETED" || status === "FAILED")
    ) {
      qc.invalidateQueries({
        queryKey: trpc.featureRequest.getById.queryKey(),
      });
    }
    lastWorkflowStatus.current = status;
  }, [prdWorkflow?.status, qc, trpc.featureRequest.getById]);

  const retryWorkflow = useMutation(
    trpc.workflow.retry.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.workflow.getLatestForFeature.queryKey(),
        });
      },
    })
  );

  // Loading state
  if (isLoading || !activeWorkspaceId) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  // Not found / error state
  if (error || !feature) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            Feature request not found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? "This feature request may have been removed."}
          </p>
          <Link
            href="/features"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-border bg-secondary/50 px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Back to Features
          </Link>
        </div>
      </div>
    );
  }

  const phase = phaseConfig[feature.phase] ?? {
    label: feature.phase,
    className: "border-border bg-secondary text-muted-foreground",
  };
  const authorName =
    feature.createdBy?.name || feature.createdBy?.email || "Unknown";

  const clarifications = feature.clarifications ?? [];
  const unansweredCount = clarifications.filter(
    (c) => !c.answer && !c.skipped
  ).length;
  const allAnswered = clarifications.length > 0 && unansweredCount === 0;
  const hasPRD = !!feature.prd;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/features" className="transition-colors hover:text-foreground">
          Features
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="truncate text-foreground">{feature.title}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            {feature.title}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${phase.className}`}
            >
              {phase.label}
            </span>
            <span>By {authorName}</span>
            <span>{formatDate(feature.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Lifecycle stepper */}
      <PhaseStepper phase={feature.phase} />

      {/* Description */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Description
          </h2>
        </div>
        <div className="p-6">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {feature.description}
          </p>
        </div>
      </div>

      {/* AI Completeness Analysis */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-teal-500/5 text-primary">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l2.4 5.4L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-1.6z" />
                </svg>
              </span>
              <h2 className="font-display text-lg font-semibold text-foreground">
                AI Completeness Analysis
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              AI-generated analysis of feature description quality
            </p>
          </div>
          <button
            onClick={() =>
              analyze.mutate({
                workspaceId: activeWorkspaceId,
                featureRequestId: feature.id,
              })
            }
            disabled={analyze.isPending}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {analyze.isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                </svg>
                Analyzing...
              </>
            ) : (
              "Run AI Analysis"
            )}
          </button>
        </div>
        <div className="p-6">
          {analyze.isPending ? (
            <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
              <svg className="h-5 w-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
              </svg>
              Running AI completeness analysis...
            </div>
          ) : analyze.error ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {analyze.error.message}
            </p>
          ) : analysis ? (
            <div className="space-y-5">
              {/* Status banner */}
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                  analysis.isComplete
                    ? "border-success/20 bg-success/5 text-success"
                    : "border-amber-500/20 bg-amber-500/5 text-amber-400"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {analysis.isComplete ? (
                    <polyline points="20 6 9 17 4 12" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </>
                  )}
                </svg>
                {analysis.isComplete
                  ? "This feature request looks complete."
                  : "This feature request is missing some details."}
              </div>

              {/* Duplicate guidance */}
              {analysis.isDuplicate && analysis.duplicateGuidance && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-cyan-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Possible duplicate
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {analysis.duplicateGuidance}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Missing elements */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    Missing Information
                  </h4>
                  {analysis.missingElements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nothing missing.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {analysis.missingElements.map((el, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                          {missingElementLabels[el] ?? el}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Follow-up questions */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h4 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-primary">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Follow-up Questions
                  </h4>
                  {analysis.questions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No follow-up questions.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {analysis.questions.map((q, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  )}
                  {analysis.questions.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground/70">
                      These questions were added to the clarifications below.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Run the AI analysis to check whether this feature request has a
              clear problem statement, user impact, and desired outcome.
            </p>
          )}
        </div>
      </div>

      {/* Clarification Q&A */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Clarification Questions
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated questions to improve feature completeness
          </p>
        </div>
        <div className="space-y-4 p-6">
          {clarifications.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No clarification questions yet. Run the AI analysis to generate
              them.
            </p>
          ) : (
            clarifications.map((q) => (
              <div
                key={q.id}
                className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
              >
                <p className="flex items-start gap-2 text-sm font-medium text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                    Q
                  </span>
                  {q.question}
                </p>
                {q.answer ? (
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-sm text-muted-foreground">{q.answer}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                      <svg className="h-3 w-3 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Answered
                      {q.answeredAt ? ` on ${formatDate(q.answeredAt)}` : ""}
                    </p>
                  </div>
                ) : q.skipped ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="13 17 18 12 13 7" />
                      <polyline points="6 17 11 12 6 7" />
                    </svg>
                    Skipped — not included in the PRD
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <textarea
                        placeholder="Type your answer..."
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        disabled={submitClarification.isPending}
                        className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
                      />
                      <div className="flex flex-col gap-2">
                        <button
                          disabled={
                            !answers[q.id]?.trim() || submitClarification.isPending
                          }
                          onClick={() =>
                            submitClarification.mutate({
                              workspaceId: activeWorkspaceId,
                              featureRequestId: feature.id,
                              clarificationId: q.id,
                              answer: answers[q.id]!.trim(),
                            })
                          }
                          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                        >
                          {submitClarification.isPending ? "Saving..." : "Answer"}
                        </button>
                        <button
                          disabled={
                            aiAnsweringId === q.id ||
                            submitClarification.isPending
                          }
                          onClick={() => {
                            setAiAnsweringId(q.id);
                            suggestAnswer.mutate({
                              workspaceId: activeWorkspaceId,
                              featureRequestId: feature.id,
                              clarificationId: q.id,
                              currentDraft: answers[q.id]?.trim() || undefined,
                            });
                          }}
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {aiAnsweringId === q.id ? (
                            <>
                              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                              </svg>
                              Thinking...
                            </>
                          ) : (
                            <>
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2l2.4 5.4L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-1.6z" />
                              </svg>
                              {answers[q.id]?.trim() ? "Refine with AI" : "Answer with AI"}
                            </>
                          )}
                        </button>
                        <button
                          disabled={
                            skipClarification.isPending ||
                            submitClarification.isPending
                          }
                          onClick={() =>
                            skipClarification.mutate({
                              workspaceId: activeWorkspaceId,
                              featureRequestId: feature.id,
                              clarificationId: q.id,
                            })
                          }
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/50 px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {skipClarification.isPending ? "Skipping..." : "Skip"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {submitClarification.error && (
            <p className="text-xs text-destructive">
              {submitClarification.error.message}
            </p>
          )}
          {suggestAnswer.error && (
            <p className="text-xs text-destructive">
              {suggestAnswer.error.message}
            </p>
          )}
        </div>
      </div>

      {/* Generate PRD */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Generate PRD
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Once clarifications are answered, generate a product requirements
            document.
          </p>
        </div>
        <div className="p-6">
          {(() => {
            const wf = (prdWorkflow as WorkflowStatusData | null) ?? null;
            const wfActive =
              wf && (wf.status === "RUNNING" || wf.status === "PENDING");
            const wfFailed = wf && wf.status === "FAILED";
            const showProgress = prdStarted || wfActive || wfFailed;

            if (showProgress) {
              return (
                <PrdGenerationProgress
                  workflow={wf}
                  starting={prdStarted && !wf}
                  retrying={retryWorkflow.isPending}
                  featureRequestId={feature.id}
                  onRetry={() => {
                    if (wf) retryWorkflow.mutate({ workflowId: wf.id });
                  }}
                />
              );
            }

            return (
              <div className="space-y-3">
                {hasPRD && (
                  <p className="text-sm text-muted-foreground">
                    A PRD has already been generated.{" "}
                    <Link href={`/prd/${feature.id}`} className="text-primary hover:underline">
                      View it here.
                    </Link>
                    {feature.prd?.status === "APPROVED"
                      ? " It's approved and locked."
                      : " You can regenerate it after updating clarifications (the current version is saved to history)."}
                  </p>
                )}
                {!hasPRD && clarifications.length > 0 && !allAnswered && (
                  <p className="text-sm text-muted-foreground">
                    Answer or skip all clarification questions to enable PRD
                    generation ({unansweredCount} remaining).
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      triggerPRD.mutate({
                        workspaceId: activeWorkspaceId,
                        featureRequestId: feature.id,
                      })
                    }
                    disabled={
                      triggerPRD.isPending ||
                      feature.prd?.status === "APPROVED" ||
                      (clarifications.length > 0 && !allAnswered)
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                  >
                    {triggerPRD.isPending ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                        </svg>
                        Starting...
                      </>
                    ) : hasPRD ? (
                      "Regenerate PRD"
                    ) : (
                      "Generate PRD"
                    )}
                  </button>
                </div>
                {triggerPRD.error && (
                  <p className="text-xs text-destructive">
                    {triggerPRD.error.message}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
