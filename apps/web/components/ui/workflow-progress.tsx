"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@shipflow/ui";
import { useTRPC } from "../../lib/trpc-react";
import { useWorkflowStream } from "../../lib/use-workflow-stream";

interface WorkflowProgressProps {
  workflowId: string;
  /** Whether to show a cancel button for running workflows. */
  canCancel?: boolean;
  /** Polling interval in ms while the workflow is active. Default 2500. */
  pollInterval?: number;
  onCancelled?: (workflowId: string) => void;
}

const statusBadge: Record<string, string> = {
  RUNNING: "bg-primary/10 text-primary border border-primary/20",
  PENDING: "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20",
  COMPLETED:
    "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
  FAILED: "bg-red-500/10 text-red-500 border border-red-500/20",
  CANCELLED: "bg-muted text-muted-foreground border border-border",
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function humanizeStep(step: string | null | undefined): string {
  if (!step) return "Starting…";
  return step.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Live workflow progress card backed by `workflow.getStatus`.
 * Polls while the workflow is RUNNING/PENDING and stops once it settles.
 */
export function WorkflowProgress({
  workflowId,
  canCancel = false,
  pollInterval = 2500,
  onCancelled,
}: WorkflowProgressProps) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  // Live updates via SSE; while the stream is connected we disable polling.
  const { snapshot, connected } = useWorkflowStream(workflowId);

  const { data: queryData, isLoading, error } = useQuery(
    trpc.workflow.getStatus.queryOptions(
      { workflowId },
      {
        enabled: !!workflowId,
        // Poll only while active AND the live stream is not connected.
        refetchInterval: (query) => {
          if (connected) return false;
          const status = query.state.data?.status;
          return status === "RUNNING" || status === "PENDING"
            ? pollInterval
            : false;
        },
      }
    )
  );

  // Prefer the live snapshot when available, falling back to the query result.
  const data = React.useMemo(() => {
    if (snapshot && queryData) {
      return { ...queryData, ...snapshot };
    }
    return snapshot
      ? {
          ...snapshot,
          startedAt: null,
          completedAt: null,
          featureRequestId: null,
        }
      : queryData;
  }, [snapshot, queryData]);

  const cancel = useMutation(
    trpc.workflow.cancel.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: trpc.workflow.getStatus.queryKey({ workflowId }),
        });
        onCancelled?.(workflowId);
      },
    })
  );

  if (isLoading && !data) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="space-y-3 py-6">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          {error?.message ?? "Workflow not found."}
        </CardContent>
      </Card>
    );
  }

  const isActive = data.status === "RUNNING" || data.status === "PENDING";
  const barColor =
    data.status === "COMPLETED"
      ? "bg-emerald-500"
      : data.status === "FAILED"
        ? "bg-red-500"
        : data.status === "CANCELLED"
          ? "bg-muted-foreground"
          : "bg-primary";

  return (
    <Card className="border border-border bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-display text-lg">
              Workflow Progress
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground capitalize">
              {data.type.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connected && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            )}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                statusBadge[data.status] ??
                "bg-secondary text-muted-foreground border border-border"
              }`}
            >
              {data.status.toLowerCase()}
            </span>
            {canCancel && isActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancel.mutate({ workflowId })}
                disabled={cancel.isPending}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                {cancel.isPending ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              {humanizeStep(data.currentStep)}
            </span>
            <span className="text-muted-foreground">
              {data.percentComplete}%
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${barColor} ${
                isActive ? "animate-pulse" : ""
              }`}
              style={{ width: `${data.percentComplete}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Step {data.completedSteps} of {data.totalSteps}
            </span>
            <span>Elapsed: {formatElapsed(data.elapsedMs)}</span>
          </div>
        </div>

        {data.error && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {data.error}
          </p>
        )}

        {cancel.error && (
          <p className="text-xs text-destructive">{cancel.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default WorkflowProgress;
