"use client";

import React from "react";
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
  const reviews = rawReviews.map((r) => ({
    id: r.id,
    iteration: r.iteration,
    status: r.status as string,
    completedAt:
      "completedAt" in r ? (r.completedAt as Date | string | null) : null,
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
                        {review.issues.length === 0 ? (
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
