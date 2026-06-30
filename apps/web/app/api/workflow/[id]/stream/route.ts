import prisma from "@shipflow/database";
import { auth } from "@shipflow/auth/server";

/**
 * Server-Sent Events endpoint for live workflow progress.
 *
 * GET /api/workflow/:id/stream
 *
 * Streams the workflow's status/progress to the client as it changes, so the
 * UI updates in real time instead of polling. The stream ends automatically
 * once the workflow reaches a terminal state (COMPLETED / FAILED / CANCELLED)
 * or after a max duration cap (serverless-friendly).
 */

export const dynamic = "force-dynamic";

const POLL_MS = 1500;
const MAX_DURATION_MS = 60_000; // cap a single connection; client reconnects via EventSource

interface WorkflowSnapshot {
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

function snapshot(w: {
  id: string;
  type: string;
  status: string;
  currentStep: string | null;
  totalSteps: number;
  completedSteps: number;
  startedAt: Date | null;
  createdAt: Date;
  errorMessage: string | null;
}): WorkflowSnapshot {
  const startedAt = w.startedAt ?? w.createdAt;
  return {
    id: w.id,
    type: w.type,
    status: w.status,
    currentStep: w.currentStep,
    totalSteps: w.totalSteps,
    completedSteps: w.completedSteps,
    percentComplete:
      w.totalSteps > 0
        ? Math.round((w.completedSteps / w.totalSteps) * 100)
        : 0,
    elapsedMs: Date.now() - startedAt.getTime(),
    error: w.errorMessage,
  };
}

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // Authenticate — only logged-in users may stream workflow state.
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const startTime = Date.now();
      let lastSerialized = "";

      const tick = async (): Promise<boolean> => {
        const workflow = await prisma.workflow.findUnique({
          where: { id },
        });

        if (!workflow) {
          send("error", { message: "Workflow not found" });
          return true; // stop
        }

        const snap = snapshot(workflow);
        const serialized = JSON.stringify(snap);
        // Only emit when something actually changed.
        if (serialized !== lastSerialized) {
          lastSerialized = serialized;
          send("progress", snap);
        }

        if (TERMINAL.has(workflow.status)) {
          send("done", snap);
          return true;
        }

        if (Date.now() - startTime > MAX_DURATION_MS) {
          // Tell the client to reconnect for continued updates.
          send("timeout", snap);
          return true;
        }

        return false;
      };

      try {
        // Emit an immediate snapshot, then poll.
        let stop = await tick();
        while (!stop && !closed) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          stop = await tick();
        }
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : "stream error",
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
