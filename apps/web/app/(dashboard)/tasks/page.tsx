"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";
import { toast } from "sonner";
import { NativeSelect } from "../../../components/ui/native-select";

// Task status enum values (mirror of @shipflow/database TaskStatus).
type TaskStatus = "BACKLOG" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

interface Task {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: TaskStatus;
  order: number;
  linkedBranch?: string | null;
}

interface Column {
  id: TaskStatus;
  title: string;
  dot: string;
}

const columns: Column[] = [
  { id: "BACKLOG", title: "Backlog", dot: "bg-muted-foreground" },
  { id: "IN_PROGRESS", title: "In Progress", dot: "bg-cyan-400" },
  { id: "IN_REVIEW", title: "In Review", dot: "bg-amber-400" },
  { id: "DONE", title: "Done", dot: "bg-emerald-400" },
];

function bucketTasks(tasks: Task[]): Record<TaskStatus, Task[]> {
  const buckets: Record<TaskStatus, Task[]> = {
    BACKLOG: [],
    IN_PROGRESS: [],
    IN_REVIEW: [],
    DONE: [],
  };
  for (const task of tasks) {
    (buckets[task.status] ?? buckets.BACKLOG).push(task);
  }
  for (const key of Object.keys(buckets) as TaskStatus[]) {
    buckets[key].sort((a, b) => a.order - b.order);
  }
  return buckets;
}

export default function TaskBoardPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  // ── Projects ──────────────────────────────────────────────────────────────
  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId, refetchInterval: 15_000 }
    )
  );

  // Default to the first project once loaded.
  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId]);

  // ── Feature requests for the selected project ──────────────────────────────
  const { data: featureData, isLoading: featuresLoading } = useQuery(
    trpc.featureRequest.list.queryOptions(
      { workspaceId: activeWorkspaceId!, projectId: selectedProjectId! },
      { enabled: !!activeWorkspaceId && !!selectedProjectId, refetchInterval: 15_000 }
    )
  );

  const features = featureData?.items ?? [];

  // Default to the first feature once loaded / reset when project changes.
  useEffect(() => {
    if (features.length === 0) {
      setSelectedFeatureId(null);
      return;
    }
    const stillValid = features.some((f) => f.id === selectedFeatureId);
    if (!stillValid) {
      setSelectedFeatureId(features[0]!.id);
    }
  }, [features, selectedFeatureId]);

  const selectedFeature = features.find((f) => f.id === selectedFeatureId) ?? null;
  const isPlanning = selectedFeature?.phase === "PLANNING";

  // ── Tasks for the selected feature ──────────────────────────────────────────
  const taskListInput = {
    workspaceId: activeWorkspaceId!,
    featureRequestId: selectedFeatureId!,
  };

  const {
    data: tasksData,
    isLoading: tasksLoading,
    isError: tasksError,
  } = useQuery(
    trpc.task.list.queryOptions(taskListInput, {
      enabled: !!activeWorkspaceId && !!selectedFeatureId,
      // Poll tasks every 8 s — drag-and-drop changes made in another tab or by
      // a teammate will surface without a manual refresh.
      refetchInterval: 8_000,
    })
  );

  // Local optimistic copy of the board, kept in sync with server data.
  const [board, setBoard] = useState<Record<TaskStatus, Task[]>>(() =>
    bucketTasks([])
  );

  useEffect(() => {
    if (tasksData) {
      setBoard(bucketTasks(tasksData as Task[]));
    }
  }, [tasksData]);

  const invalidateTasks = () =>
    qc.invalidateQueries({ queryKey: trpc.task.list.queryKey() });

  // ── Mutations ───────────────────────────────────────────────────────────────
  const move = useMutation(
    trpc.task.move.mutationOptions({
      onSuccess: () => {
        invalidateTasks();
        toast.success("Task moved");
      },
      onError: (err) => {
        invalidateTasks();
        toast.error(`Failed to move task: ${err.message}`);
      }
    })
  );

  const createTask = useMutation(
    trpc.task.create.mutationOptions({
      onSuccess: () => {
        invalidateTasks();
        setShowAddForm(false);
        setNewTask({ title: "", description: "", acceptanceCriteria: "" });
        toast.success("Task created");
      },
      onError: (err) => {
        toast.error(`Failed to create task: ${err.message}`);
      }
    })
  );

  const deleteTask = useMutation(
    trpc.task.delete.mutationOptions({
      onSuccess: () => {
        invalidateTasks();
        toast.success("Task deleted");
      },
      onError: (err) => {
        toast.error(`Failed to delete task: ${err.message}`);
      }
    })
  );

  const generateFromPRD = useMutation(
    trpc.task.generateFromPRD.mutationOptions({
      onSuccess: () => {
        invalidateTasks();
        toast.success("Task generation started");
      },
      onError: (err) => {
        toast.error(`Failed to start task generation: ${err.message}`);
      }
    })
  );

  const approvePlan = useMutation(
    trpc.task.approveTaskPlan.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.featureRequest.list.queryKey() });
        invalidateTasks();
        toast.success("Task plan approved");
      },
      onError: (err) => {
        toast.error(`Failed to approve plan: ${err.message}`);
      }
    })
  );

  const rejectPlan = useMutation(
    trpc.task.rejectTaskPlan.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.featureRequest.list.queryKey() });
        invalidateTasks();
        toast.success("Task plan rejected");
      },
      onError: (err) => {
        toast.error(`Failed to reject plan: ${err.message}`);
      }
    })
  );

  const { data: latestWorkflow } = useQuery(
    trpc.workflow.getLatestForFeature.queryOptions(
      { featureRequestId: selectedFeatureId!, type: "TASK_GENERATION" },
      { enabled: !!selectedFeatureId, refetchInterval: 3000 }
    )
  );

  const isGenerating =
    latestWorkflow?.status === "RUNNING" ||
    latestWorkflow?.status === "PENDING";

  // ── Drag-and-drop state ──────────────────────────────────────────────────────
  const [draggedTask, setDraggedTask] = useState<{
    task: Task;
    fromColumn: TaskStatus;
  } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // ── Add-task inline form ──────────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    acceptanceCriteria: "",
  });

  function handleDragStart(task: Task, fromColumn: TaskStatus) {
    setDraggedTask({ task, fromColumn });
  }

  function handleDragOver(e: React.DragEvent, columnId: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(columnId);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, toColumn: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(null);

    if (!draggedTask) return;
    if (draggedTask.fromColumn === toColumn) {
      setDraggedTask(null);
      return;
    }

    const { task, fromColumn } = draggedTask;

    // Optimistically move the card for a snappy feel.
    setBoard((prev) => {
      const fromTasks = prev[fromColumn].filter((t) => t.id !== task.id);
      const movedTask = { ...task, status: toColumn };
      const toTasks = [...prev[toColumn], movedTask];
      return { ...prev, [fromColumn]: fromTasks, [toColumn]: toTasks };
    });
    setDraggedTask(null);

    if (!activeWorkspaceId) return;
    move.mutate({ workspaceId: activeWorkspaceId, id: task.id, status: toColumn });
  }

  function handleDeleteTask(columnId: TaskStatus, taskId: string) {
    if (!activeWorkspaceId) return;
    // Optimistic removal.
    setBoard((prev) => ({
      ...prev,
      [columnId]: prev[columnId].filter((t) => t.id !== taskId),
    }));
    deleteTask.mutate({ workspaceId: activeWorkspaceId, id: taskId });
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !selectedFeatureId) return;
    createTask.mutate({
      workspaceId: activeWorkspaceId,
      featureRequestId: selectedFeatureId,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      acceptanceCriteria: newTask.acceptanceCriteria.trim(),
    });
  }

  const totalTasks = useMemo(
    () => Object.values(board).reduce((sum, list) => sum + list.length, 0),
    [board]
  );

  const boardEmpty =
    !!selectedFeatureId && !tasksLoading && !tasksError && totalTasks === 0;

  const selectClass =
    "h-10 rounded-xl border border-border bg-secondary/50 px-3 pr-8 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Task Board
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Drag and drop tasks between columns to update status
          </p>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          disabled={!selectedFeatureId}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Task
        </button>
      </div>

      {/* Project + Feature selectors */}
      <div className="flex flex-wrap gap-3">
        <NativeSelect
          value={selectedProjectId ?? ""}
          onChange={(e) => {
            setSelectedProjectId(e.target.value || null);
            setSelectedFeatureId(null);
          }}
          disabled={projectsLoading || !projects || projects.length === 0}
          className="!pr-10 !bg-secondary/50 !h-10"
          aria-label="Select project"
        >
          {projectsLoading ? (
            <option>Loading projects…</option>
          ) : !projects || projects.length === 0 ? (
            <option>No projects</option>
          ) : (
            projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </NativeSelect>

        <NativeSelect
          value={selectedFeatureId ?? ""}
          onChange={(e) => setSelectedFeatureId(e.target.value || null)}
          disabled={
            !selectedProjectId || featuresLoading || features.length === 0
          }
          className="!pr-10 !bg-secondary/50 !h-10"
          aria-label="Select feature"
        >
          {featuresLoading ? (
            <option>Loading features…</option>
          ) : features.length === 0 ? (
            <option>No features</option>
          ) : (
            features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))
          )}
        </NativeSelect>
      </div>

      {/* Inline Add Task form */}
      {showAddForm && selectedFeatureId && (
        <form
          onSubmit={handleCreateTask}
          className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <input
            type="text"
            required
            placeholder="Task title"
            value={newTask.title}
            onChange={(e) =>
              setNewTask((prev) => ({ ...prev, title: e.target.value }))
            }
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <textarea
            required
            placeholder="Description"
            rows={2}
            value={newTask.description}
            onChange={(e) =>
              setNewTask((prev) => ({ ...prev, description: e.target.value }))
            }
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <textarea
            required
            placeholder="Acceptance criteria"
            rows={2}
            value={newTask.acceptanceCriteria}
            onChange={(e) =>
              setNewTask((prev) => ({
                ...prev,
                acceptanceCriteria: e.target.value,
              }))
            }
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          {createTask.isError && (
            <p className="text-xs text-destructive">
              {createTask.error?.message ?? "Failed to create task."}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                createTask.isPending ||
                !newTask.title.trim() ||
                !newTask.description.trim() ||
                !newTask.acceptanceCriteria.trim()
              }
              className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-gradient px-4 text-sm font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createTask.isPending ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      )}

      {/* Task Plan Approval Banner — only during PLANNING phase */}
      {isPlanning && selectedFeature && (
        <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Task plan awaiting approval
                </p>
                <p className="text-xs text-muted-foreground">
                  Review the {totalTasks} task{totalTasks === 1 ? "" : "s"} for
                  &quot;{selectedFeature.title}&quot; and approve to continue.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                disabled={rejectPlan.isPending || !activeWorkspaceId}
                onClick={() =>
                  activeWorkspaceId &&
                  selectedFeatureId &&
                  rejectPlan.mutate({
                    workspaceId: activeWorkspaceId,
                    featureRequestId: selectedFeatureId,
                  })
                }
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-secondary/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rejectPlan.isPending ? "Rejecting…" : "Reject"}
              </button>
              <button
                disabled={approvePlan.isPending || !activeWorkspaceId}
                onClick={() =>
                  activeWorkspaceId &&
                  selectedFeatureId &&
                  approvePlan.mutate({
                    workspaceId: activeWorkspaceId,
                    featureRequestId: selectedFeatureId,
                  })
                }
                className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-gradient px-3 text-xs font-medium text-primary-foreground shadow-md shadow-primary/25 transition-all hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {approvePlan.isPending ? "Approving…" : "Approve Plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No feature selected (and not loading) */}
      {!selectedFeatureId && !featuresLoading && !projectsLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            No feature selected
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a project and feature to view its task board.
          </p>
        </div>
      )}

      {/* Board empty — offer generation from PRD */}
      {boardEmpty && !isGenerating && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/5 text-primary">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 5.4L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-1.6z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">No tasks yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Generate a task plan from the approved PRD, or add tasks manually.
          </p>
          {generateFromPRD.isError && (
            <p className="mt-2 text-xs text-destructive">
              {generateFromPRD.error?.message ?? "Failed to generate tasks."}
            </p>
          )}
          <button
            onClick={() =>
              activeWorkspaceId &&
              selectedFeatureId &&
              generateFromPRD.mutate({
                workspaceId: activeWorkspaceId,
                featureRequestId: selectedFeatureId,
              })
            }
            disabled={generateFromPRD.isPending || !activeWorkspaceId}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {generateFromPRD.isPending ? "Generating…" : "Generate tasks from PRD"}
          </button>
        </div>
      )}

      {/* Generating tasks state */}
      {isGenerating && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 py-16 text-center shadow-sm">
          <div className="flex items-center justify-center rounded-xl bg-primary/10 p-3 text-primary">
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p className="mt-4 animate-pulse text-sm font-medium text-primary">Generating tasks with AI...</p>
          <p className="mt-1 max-w-sm text-sm text-primary/70">
            This usually takes 10-20 seconds. Grab a coffee!
          </p>
        </div>
      )}

      {/* Error state */}
      {tasksError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load tasks. Please try again.
        </div>
      )}

      {/* Kanban Board */}
      {!!selectedFeatureId && !boardEmpty && !tasksError && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <div
              key={column.id}
              className={`flex flex-col rounded-xl border bg-card/40 p-3 transition-all ${
                dragOverColumn === column.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border"
              }`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
                  <h3 className="text-sm font-semibold text-foreground">
                    {column.title}
                  </h3>
                </div>
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-medium text-muted-foreground">
                  {tasksLoading ? "·" : board[column.id].length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="flex-1 space-y-2">
                {tasksLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border bg-background p-3.5 shadow-sm"
                    >
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
                      <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                  ))
                ) : (
                  <>
                    {board[column.id].map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => handleDragStart(task, column.id)}
                        onClick={() => setViewingTask(task)}
                        className="group cursor-pointer rounded-xl border border-border bg-background p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg active:cursor-grabbing active:opacity-60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-foreground">
                            {task.title}
                          </h4>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTask(column.id, task.id);
                            }}
                            className="shrink-0 rounded-md p-0.5 text-muted-foreground/60 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            aria-label={`Delete task: ${task.title}`}
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                        {task.linkedBranch && (
                          <div className="mt-3 flex items-center justify-end">
                            <span className="flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="6" y1="3" x2="6" y2="15" />
                                <circle cx="18" cy="6" r="3" />
                                <circle cx="6" cy="18" r="3" />
                                <path d="M18 9a9 9 0 0 1-9 9" />
                              </svg>
                              {task.linkedBranch}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Empty column drop target */}
                    {board[column.id].length === 0 && (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground/70">
                        Drop tasks here
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Task Details Modal */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingTask(null)}
              className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h2 className="text-xl font-semibold mb-6 pr-8 text-foreground">{viewingTask.title}</h2>
            
            <div className="space-y-6 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-foreground/80 mb-2">Task ID</h3>
                  <code className="rounded-md bg-secondary px-2 py-1 text-xs text-foreground/80 border border-border">{viewingTask.id}</code>
                </div>
                <div>
                  <h3 className="font-medium text-foreground/80 mb-2">Branch Name</h3>
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-secondary px-2 py-1 text-xs text-foreground/80 border border-border">feature/{viewingTask.id}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(`feature/${viewingTask.id}`)}
                      className="rounded-md bg-primary/10 text-primary px-3 py-1 text-xs font-medium hover:bg-primary/20 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="h-px w-full bg-border" />

              <div>
                <h3 className="font-medium text-foreground mb-2 text-base">Description</h3>
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed bg-secondary/30 p-4 rounded-xl border border-border/50">{viewingTask.description}</p>
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-2 text-base">Acceptance Criteria</h3>
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed bg-secondary/30 p-4 rounded-xl border border-border/50">{viewingTask.acceptanceCriteria}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
