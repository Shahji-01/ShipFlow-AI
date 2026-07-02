"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@shipflow/ui";
import { useTRPC } from "../../../../lib/trpc-react";
import { useWorkspace } from "../../../../lib/workspace-context";

const statusColors: Record<string, string> = {
  OPEN: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CLOSED: "bg-red-500/10 text-red-400 border border-red-500/20",
  MERGED: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
};

const reviewStatusColors: Record<string, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  PENDING: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  IN_PROGRESS: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  FAILED: "bg-red-500/10 text-red-400 border border-red-500/20",
};

const categoryColors: Record<string, string> = {
  BLOCKING: "bg-red-500/10 text-red-400 border border-red-500/20",
  NON_BLOCKING: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
};

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
}

function parseDiffFiles(diffSummary: unknown): DiffFile[] {
  if (!diffSummary || typeof diffSummary !== "object") return [];
  const files = (diffSummary as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      path: String(f.path ?? ""),
      additions: Number(f.additions ?? 0),
      deletions: Number(f.deletions ?? 0),
    }));
}

function formatTimestamp(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PRDetailPage() {
  const params = useParams();
  const pullRequestId = Array.isArray(params.id) ? params.id[0]! : params.id!;

  const trpc = useTRPC();
  const { activeWorkspaceId } = useWorkspace();
  const qc = useQueryClient();

  const enabled = !!activeWorkspaceId && !!pullRequestId;

  const { data: pr, isLoading, error } = useQuery(
    trpc.github.getPRDetails.queryOptions(
      { workspaceId: activeWorkspaceId!, pullRequestId },
      {
        enabled,
        // Poll while a review might be in progress (PENDING/IN_PROGRESS).
        // Once all reviews are in a terminal state, the default window-focus
        // refetch is enough.
        refetchInterval: (query) => {
          const reviews = (query.state.data as { reviews?: { status: string }[] } | undefined)?.reviews ?? [];
          const isActive = reviews.some(
            (r) => r.status === "PENDING" || r.status === "IN_PROGRESS"
          );
          return isActive ? 3_000 : 15_000;
        },
      }
    )
  );

  const { data: history } = useQuery(
    trpc.review.getReviewHistory.queryOptions(
      { workspaceId: activeWorkspaceId!, pullRequestId },
      {
        enabled,
        refetchInterval: (query) => {
          const reviews = (query.state.data as { reviews?: { status: string }[] } | undefined)?.reviews ?? [];
          const isActive = reviews.some(
            (r) => r.status === "PENDING" || r.status === "IN_PROGRESS"
          );
          return isActive ? 3_000 : 15_000;
        },
      }
    )
  );

  function invalidate() {
    qc.invalidateQueries({
      queryKey: trpc.github.getPRDetails.queryKey({
        workspaceId: activeWorkspaceId!,
        pullRequestId,
      }),
    });
    qc.invalidateQueries({
      queryKey: trpc.review.getReviewHistory.queryKey({
        workspaceId: activeWorkspaceId!,
        pullRequestId,
      }),
    });
  }

  const triggerReview = useMutation(
    trpc.review.triggerReview.mutationOptions({ onSuccess: invalidate })
  );
  const retryReview = useMutation(
    trpc.review.retryReview.mutationOptions({ onSuccess: invalidate })
  );

  // Prefer richer review history if available, fall back to getPRDetails.
  // Normalize both sources to a single shape so types unify.
  const rawReviews = history?.reviews ?? pr?.reviews ?? [];
  const allMappedReviews = rawReviews.map((r) => ({
    id: r.id,
    iteration: r.iteration,
    status: r.status as string,
    completedAt:
      "completedAt" in r ? (r.completedAt as Date | string | null) : null,
    startedAt:
      "startedAt" in r ? (r.startedAt as Date | string | null) : null,
    errorMessage:
      "errorMessage" in r ? (r.errorMessage as string | null) : null,
    issues: (r.issues ?? []).map((i) => ({
      id: i.id,
      category: i.category as string,
      filePath: i.filePath,
      lineNumber: i.lineNumber,
      title: i.title,
      description: i.description,
      resolved: i.resolved,
    })),
  }));

  // Deduplicate reviews by iteration (preferring completed over pending)
  // due to a previous bug that created duplicate records.
  const reviewsByIteration = new Map<number, typeof allMappedReviews[0]>();
  for (const r of allMappedReviews) {
    const existing = reviewsByIteration.get(r.iteration);
    if (!existing) {
      reviewsByIteration.set(r.iteration, r);
    } else {
      // Prefer terminal states over pending
      if (r.status === "COMPLETED" || r.status === "FAILED") {
        reviewsByIteration.set(r.iteration, r);
      }
    }
  }
  const reviews = Array.from(reviewsByIteration.values()).sort(
    (a, b) => b.iteration - a.iteration
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="space-y-6">
        <Link
          href="/reviews"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BackArrow />
          Back to Reviews
        </Link>
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            Pull request not found
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ??
              "This pull request may have been removed or is not in your workspace."}
          </p>
        </div>
      </div>
    );
  }

  const diffFiles = parseDiffFiles(pr.diffSummary);
  const totalAdditions = diffFiles.reduce((s, f) => s + f.additions, 0);
  const totalDeletions = diffFiles.reduce((s, f) => s + f.deletions, 0);
  const hasFailedReview = reviews.some((r) => r.status === "FAILED");
  const failedReview = reviews.find((r) => r.status === "FAILED");

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <Link
        href="/reviews"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <BackArrow />
        Back to Reviews
      </Link>

      {/* PR Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            <span className="text-muted-foreground">#{pr.number}</span>{" "}
            {pr.title}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
              statusColors[pr.status] ??
              "bg-secondary text-muted-foreground border border-border"
            }`}
          >
            {pr.status.toLowerCase()}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>{pr.repository.fullName}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 font-mono">
            {pr.branchName} → {pr.repository.defaultBranch}
          </span>
          {pr.task && <span>Task: {pr.task.title}</span>}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={() =>
              triggerReview.mutate({
                workspaceId: activeWorkspaceId!,
                pullRequestId,
              })
            }
            disabled={triggerReview.isPending}
            className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
          >
            {triggerReview.isPending ? "Triggering..." : "Trigger AI review"}
          </Button>
          {hasFailedReview && failedReview && (
            <Button
              variant="outline"
              onClick={() =>
                retryReview.mutate({
                  workspaceId: activeWorkspaceId!,
                  reviewId: failedReview.id,
                })
              }
              disabled={retryReview.isPending}
            >
              {retryReview.isPending ? "Retrying..." : "Retry failed review"}
            </Button>
          )}
        </div>
        {(triggerReview.error || retryReview.error) && (
          <p className="mt-2 text-xs text-destructive">
            {triggerReview.error?.message ?? retryReview.error?.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Files + AI Review */}
        <div className="space-y-6 lg:col-span-2">
          {/* Changed Files */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Changed Files ({diffFiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {diffFiles.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No diff summary available for this pull request.
                </p>
              ) : (
                <div className="space-y-2">
                  {diffFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3 transition-colors hover:border-primary/30"
                    >
                      <span className="truncate font-mono text-sm text-foreground">
                        {file.path}
                      </span>
                      <div className="flex shrink-0 items-center gap-2 text-xs">
                        {file.additions > 0 && (
                          <span className="font-medium text-success">
                            +{file.additions}
                          </span>
                        )}
                        {file.deletions > 0 && (
                          <span className="font-medium text-destructive">
                            -{file.deletions}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Review History */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                AI Review History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {reviews.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No AI reviews yet. Trigger a review to get started.
                </p>
              ) : (
                reviews.map((review, reviewIdx) => {
                  // Group issues by category (severity = category).
                  const grouped = review.issues.reduce<
                    Record<string, typeof review.issues>
                  >((acc, issue) => {
                    (acc[issue.category] ??= []).push(issue);
                    return acc;
                  }, {});

                  return (
                    <div key={review.id} className="relative">
                      {reviewIdx < reviews.length - 1 && (
                        <div className="absolute left-[5px] top-6 h-full w-px bg-border" />
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]" />
                        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          Iteration #{review.iteration}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            reviewStatusColors[review.status] ??
                            "bg-secondary text-muted-foreground border border-border"
                          }`}
                        >
                          {review.status.toLowerCase().replace("_", " ")}
                        </span>
                        {review.completedAt && (
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(review.completedAt)}
                          </span>
                        )}
                      </div>

                      {review.errorMessage && (
                        <p className="ml-6 mt-2 text-xs text-destructive">
                          {review.errorMessage}
                        </p>
                      )}

                      <div className="ml-6 mt-3 space-y-3">
                        {review.status === "PENDING" || review.status === "IN_PROGRESS" || review.status === "FAILED" ? (
                          <AiReviewProgress review={review} />
                        ) : review.issues.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No issues found in this iteration.
                          </p>
                        ) : (
                          Object.entries(grouped).map(([category, issues]) => (
                            <div key={category} className="space-y-2">
                              <h4 className="text-sm font-medium capitalize text-foreground">
                                {category.toLowerCase().replace("_", " ")}
                              </h4>
                              {issues.map((issue) => (
                                <div
                                  key={issue.id}
                                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-secondary/40 p-2.5"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span
                                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize ${
                                        categoryColors[issue.category] ??
                                        "bg-secondary text-muted-foreground border border-border"
                                      }`}
                                    >
                                      {issue.category
                                        .toLowerCase()
                                        .replace("_", " ")}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-foreground">
                                        {issue.title}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {issue.description}
                                      </p>
                                      {issue.filePath && (
                                        <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                                          {issue.filePath}
                                          {issue.lineNumber
                                            ? `:${issue.lineNumber}`
                                            : ""}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={`shrink-0 text-xs font-medium ${
                                      issue.resolved
                                        ? "text-success"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {issue.resolved ? "✓ Resolved" : "Open"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Stats */}
        <div className="space-y-6">
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle className="font-display text-lg">Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Files Changed</span>
                  <span className="font-medium text-foreground">
                    {diffFiles.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Additions</span>
                  <span className="font-medium text-success">
                    +{totalAdditions}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Deletions</span>
                  <span className="font-medium text-destructive">
                    -{totalDeletions}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    AI Review Iterations
                  </span>
                  <span className="font-medium text-foreground">
                    {reviews.length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {pr.task && (
            <Card className="border border-border bg-card">
              <CardHeader>
                <CardTitle className="font-display text-lg">
                  Linked Task
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-foreground">
                  {pr.task.title}
                </p>
                {pr.task.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pr.task.description}
                  </p>
                )}
                <span className="mt-3 inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                  {pr.task.status.toLowerCase().replace("_", " ")}
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const AI_REVIEW_STEPS = [
  { key: "context", label: "Fetch PR context", desc: "Fetching code changes and related tasks" },
  { key: "analyze", label: "Analyze code", desc: "Running AI review on changes" },
  { key: "categorize", label: "Categorize issues", desc: "Structuring issues and findings" },
  { key: "comments", label: "Post comments", desc: "Publishing inline comments to GitHub" },
] as const;

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function useLiveElapsed(
  startedAt: Date | string | null,
  completedAt: Date | string | null,
  active: boolean
): number {
  const [mountTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  
  const effectiveStartedAt = startedAt ? new Date(startedAt).getTime() : mountTime;
  
  if (!active) {
    if (startedAt && completedAt) {
      return Math.max(0, new Date(completedAt).getTime() - effectiveStartedAt);
    }
    return 0; // fallback if no completedAt
  }
  
  return Math.max(0, now - effectiveStartedAt);
}

function StepIcon({ state }: { state: "done" | "active" | "failed" | "pending" }) {
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

function AiReviewProgress({ review }: { review: any }) {
  const isRunning = review.status === "PENDING" || review.status === "IN_PROGRESS";
  const isFailed = review.status === "FAILED";
  const isComplete = review.status === "COMPLETED";

  const elapsed = useLiveElapsed(
    review.startedAt,
    review.completedAt,
    isRunning
  );

  let completedSteps = 0;
  if (isComplete) completedSteps = 4;
  else {
    if (elapsed > 12000) completedSteps = 3; 
    else if (elapsed > 8000) completedSteps = 2;
    else if (elapsed > 3000) completedSteps = 1; 
    else completedSteps = 0;
  }

  const percent = isComplete
    ? 100
    : Math.max(0, Math.min(isFailed ? 100 : 95, Math.round((elapsed / 15000) * 100)));

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card/50 p-5 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {isRunning && (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
              </svg>
            )}
            {isFailed ? "Failed" : isRunning ? "Running" : "Complete"}
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

      <ol className="space-y-1">
        {AI_REVIEW_STEPS.map((s, i) => {
          let state: "done" | "active" | "failed" | "pending";
          if (isComplete || i < completedSteps) state = "done";
          else if (i === completedSteps && isFailed) state = "failed";
          else if (i === completedSteps && isRunning) state = "active";
          else state = "pending";

          return (
            <li key={s.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StepIcon state={state} />
                {i < AI_REVIEW_STEPS.length - 1 && (
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
    </div>
  );
}
