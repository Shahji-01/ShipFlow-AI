"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

const APPROVER_ROLES = ["ADMIN", "APPROVER"];

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The PRD content is stored as free-form JSON. Try to surface a human-readable
 * summary from common keys, otherwise return null so we can fall back.
 */
function prdSummary(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  const candidate = c.summary ?? c.overview ?? c.description;
  return typeof candidate === "string" && candidate.trim()
    ? candidate
    : null;
}

export default function ApprovalsPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const qc = useQueryClient();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);

  const role = activeWorkspace?.role;
  const canApprove = !!role && APPROVER_ROLES.includes(role);

  const { data, isLoading } = useQuery(
    trpc.approval.getApprovalQueue.queryOptions(
      { workspaceId: activeWorkspaceId! },
      {
        enabled: !!activeWorkspaceId && canApprove,
        // Approval queue changes when AI reviews complete or PRDs are approved —
        // poll every 10 s so new items appear without a page refresh.
        refetchInterval: 10_000,
      }
    )
  );

  function invalidate() {
    qc.invalidateQueries({
      queryKey: trpc.approval.getApprovalQueue.queryKey(),
    });
  }

  const approve = useMutation(
    trpc.approval.approve.mutationOptions({
      onSuccess: () => {
        setConfirmApproveId(null);
        invalidate();
      },
    })
  );

  const reject = useMutation(
    trpc.approval.reject.mutationOptions({
      onSuccess: () => {
        setRejectingId(null);
        setRejectComment("");
        invalidate();
      },
    })
  );

  // Permission gate (Requirement 6.5): only ADMIN/APPROVER may view the queue.
  if (activeWorkspace && !canApprove) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Approvals
          </h1>
        </div>
        <Card className="border border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-destructive/20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
                <LockIcon className="h-7 w-7 text-destructive" />
              </div>
            </div>
            <h2 className="mt-5 font-display text-lg font-semibold text-foreground">
              Permission Denied
            </h2>
            <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
              You don&apos;t have permission to access the approval queue. Only
              users with the Approver or Admin role can approve or reject
              features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = data?.items ?? [];

  function handleApprove(id: string) {
    setConfirmApproveId(id);
    setRejectingId(null);
  }

  function confirmApprove(id: string) {
    if (!activeWorkspaceId) return;
    approve.mutate({ workspaceId: activeWorkspaceId, featureRequestId: id });
  }

  function handleReject(id: string) {
    setRejectingId(id);
    setConfirmApproveId(null);
    setRejectComment("");
  }

  function confirmReject(id: string) {
    if (!rejectComment.trim() || !activeWorkspaceId) return;
    reject.mutate({
      workspaceId: activeWorkspaceId,
      featureRequestId: id,
      comment: rejectComment.trim(),
    });
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Approval Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Features awaiting human approval before shipping
        </p>
      </div>

      {/* Approval Items */}
      <div className="space-y-6">
        {isLoading || !activeWorkspace ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-5 h-16 w-full animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <CheckIcon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">
              Nothing awaiting approval
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Features will appear here once they pass AI review and are ready to
              ship.
            </p>
          </div>
        ) : (
          items.map((item) => {
            // Aggregate task / review stats from live data.
            const totalTasks = item.tasks.length;
            const completedTasks = item.tasks.filter(
              (t) => t.status === "DONE"
            ).length;
            const allReviews = item.tasks.flatMap((t) =>
              t.pullRequests.flatMap((pr) => pr.reviews)
            );
            const allIssues = allReviews.flatMap((r) => r.issues);
            const resolvedIssues = allIssues.filter((i) => i.resolved).length;
            const openIssues = allIssues.filter((i) => !i.resolved).length;
            const nonBlockingIssues = allIssues.filter(
              (i) => i.category === "NON_BLOCKING" && !i.resolved
            );
            const firstPr = item.tasks
              .flatMap((t) => t.pullRequests)
              .find(Boolean);
            const authorName =
              item.createdBy?.name || item.createdBy?.email || "Unknown";

            return (
              <Card
                key={item.id}
                className="border border-border bg-card transition-all hover:border-primary/30"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="font-display text-lg">
                        {item.title}
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {firstPr
                          ? `PR #${firstPr.number}: ${firstPr.title} · `
                          : ""}
                        {item.project.name} · by {authorName}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Submitted {formatDate(item.updatedAt)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* PRD Summary */}
                  <div>
                    <h4 className="text-sm font-medium text-foreground">
                      PRD Summary
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {prdSummary(item.prd?.content) ??
                        item.description ??
                        "No PRD summary available."}
                    </p>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-border bg-secondary/40 p-3">
                      <p className="text-xs text-muted-foreground">Tasks</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {completedTasks}/{totalTasks} completed
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        AI Iterations
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">
                        {allReviews.length}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        Issues Resolved
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-success">
                        {resolvedIssues}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-secondary/40 p-3">
                      <p className="text-xs text-muted-foreground">Open Issues</p>
                      <p className="mt-0.5 text-sm font-semibold text-warning">
                        {openIssues}
                      </p>
                    </div>
                  </div>

                  {/* Non-blocking Issues */}
                  {nonBlockingIssues.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground">
                        Non-blocking Issues
                      </h4>
                      <ul className="mt-1.5 space-y-1">
                        {nonBlockingIssues.map((issue) => (
                          <li
                            key={issue.id}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <span className="mt-0.5 text-warning">•</span>
                            <span>
                              {issue.title}
                              {issue.filePath ? (
                                <span className="font-mono text-xs text-muted-foreground/70">
                                  {" "}
                                  ({issue.filePath}
                                  {issue.lineNumber
                                    ? `:${issue.lineNumber}`
                                    : ""}
                                  )
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-3 border-t border-border pt-4">
                    <Button
                      onClick={() => handleApprove(item.id)}
                      className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                    >
                      Approve &amp; Ship
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleReject(item.id)}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      Reject
                    </Button>
                  </div>

                  {/* Approve Confirmation */}
                  {confirmApproveId === item.id && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                      <p className="text-sm text-emerald-600">
                        Are you sure you want to approve this feature? It will
                        transition to
                        <span className="font-semibold"> Shipped</span> status.
                      </p>
                      {approve.error && (
                        <p className="mt-2 text-xs text-destructive">
                          {approve.error.message}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => confirmApprove(item.id)}
                          disabled={approve.isPending}
                          className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                        >
                          {approve.isPending ? "Approving..." : "Yes, Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmApproveId(null)}
                          disabled={approve.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Reject Form */}
                  {rejectingId === item.id && (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                      <p className="mb-2 text-sm text-destructive">
                        Please provide a reason for rejection:
                      </p>
                      <textarea
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Explain why this feature is being rejected..."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-destructive focus:outline-none focus:ring-2 focus:ring-destructive/20"
                        rows={3}
                      />
                      {reject.error && (
                        <p className="mt-2 text-xs text-destructive">
                          {reject.error.message}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmReject(item.id)}
                          disabled={!rejectComment.trim() || reject.isPending}
                        >
                          {reject.isPending
                            ? "Rejecting..."
                            : "Confirm Rejection"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectingId(null)}
                          disabled={reject.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4L12 14.01l-3-3" />
    </svg>
  );
}
