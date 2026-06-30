"use client";

import * as React from "react";

export interface WorkflowSnapshot {
  id: string;
  type: string;
  status: string;
  currentStep: string | null;
  totalSteps: number;
  completedSteps: number;
  percentComplete: number;
  elapsedMs: number;
  error: string | null;
}

/**
 * Subscribes to the live workflow SSE stream at /api/workflow/:id/stream and
 * returns the latest snapshot. Automatically reconnects while the workflow is
 * still active (the server caps each connection's duration). Stops once a
 * terminal state is reached.
 *
 * Falls back gracefully: if the stream errors, callers should keep their
 * existing polling query as a backup source of truth.
 */
export function useWorkflowStream(
  workflowId: string | null | undefined,
  enabled = true
): { snapshot: WorkflowSnapshot | null; connected: boolean } {
  const [snapshot, setSnapshot] = React.useState<WorkflowSnapshot | null>(null);
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!workflowId || !enabled) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    let stopped = false;
    let source: EventSource | null = null;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(`/api/workflow/${workflowId}/stream`);

      source.addEventListener("open", () => setConnected(true));

      const onSnap = (e: MessageEvent) => {
        try {
          setSnapshot(JSON.parse(e.data) as WorkflowSnapshot);
        } catch {
          /* ignore malformed frame */
        }
      };

      source.addEventListener("progress", onSnap);

      source.addEventListener("done", (e) => {
        onSnap(e as MessageEvent);
        stopped = true;
        source?.close();
        setConnected(false);
      });

      // Server capped the connection — reconnect to continue receiving updates.
      source.addEventListener("timeout", (e) => {
        onSnap(e as MessageEvent);
        source?.close();
        if (!stopped) setTimeout(connect, 250);
      });

      source.addEventListener("error", () => {
        setConnected(false);
        source?.close();
        // Back off, then retry unless we've been told to stop.
        if (!stopped) setTimeout(connect, 3000);
      });
    };

    connect();

    return () => {
      stopped = true;
      source?.close();
      setConnected(false);
    };
  }, [workflowId, enabled]);

  return { snapshot, connected };
}
