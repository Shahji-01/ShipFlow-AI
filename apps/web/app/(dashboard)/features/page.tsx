"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";
import { toast } from "sonner";
import { NativeSelect } from "../../../components/ui/native-select";

// Maps FeaturePhase enum values to tinted pill display labels.
const phaseConfig: Record<string, { label: string; className: string }> = {
  DISCOVERY: {
    label: "Product Discovery",
    className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  },
  PLANNING: {
    label: "Planning",
    className: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  },
  DEVELOPMENT: {
    label: "Development",
    className: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  },
  AI_REVIEW: {
    label: "AI Review",
    className: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
  },
  HUMAN_APPROVAL: {
    label: "Human Approval",
    className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  },
  SHIPPED: {
    label: "Shipped",
    className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  },
  FIX_NEEDED: {
    label: "Fix Needed",
    className: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
  },
};

const phaseFilters = [
  "all",
  "DISCOVERY",
  "PLANNING",
  "DEVELOPMENT",
  "AI_REVIEW",
  "HUMAN_APPROVAL",
  "SHIPPED",
  "FIX_NEEDED",
];

const sourceFilters = [
  "all",
  "WEB",
  "EMAIL",
  "SUPPORT_TICKET",
  "CUSTOMER_SERVICE",
];

const sourceLabels: Record<string, string> = {
  WEB: "Web",
  EMAIL: "Email",
  SUPPORT_TICKET: "Support Ticket",
  CUSTOMER_SERVICE: "Customer Service",
};

function formatRelativeTime(date: Date | string): string {
  const then = new Date(date).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(date).toLocaleDateString();
}

const selectClass =
  "h-10 rounded-xl border border-border bg-secondary/50 px-3 pr-8 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/30";

/* Lifecycle order for the mini phase-progress stepper. */
const PHASE_ORDER = [
  "DISCOVERY",
  "PLANNING",
  "DEVELOPMENT",
  "AI_REVIEW",
  "HUMAN_APPROVAL",
  "SHIPPED",
] as const;

function PhaseProgress({ phase }: { phase: string }) {
  const isFix = phase === "FIX_NEEDED";
  const currentIndex = isFix
    ? PHASE_ORDER.indexOf("DEVELOPMENT")
    : PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number]);
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`Lifecycle progress: ${phase}`}
    >
      {PHASE_ORDER.map((p, i) => {
        const done = i <= currentIndex && currentIndex >= 0;
        return (
          <span
            key={p}
            className={`h-1.5 w-6 rounded-full transition-colors ${
              isFix && i === currentIndex
                ? "bg-rose-400"
                : done
                  ? "bg-primary"
                  : "bg-border"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function FeaturesListPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId, refetchInterval: 15_000 }
    )
  );

  // Default-select the first project once projects load.
  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setSelectedProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      return projects[0]!.id;
    });
  }, [projects]);

  const createProject = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (project) => {
        qc.invalidateQueries({ queryKey: trpc.project.list.queryKey() });
        setSelectedProjectId(project.id);
        setNewProjectName("");
        toast.success("Project created successfully");
      },
      onError: (err) => {
        toast.error(`Failed to create project: ${err.message}`);
      }
    })
  );

  const deleteFeature = useMutation(
    trpc.featureRequest.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.featureRequest.list.queryKey() });
        toast.success("Feature deleted");
      },
      onError: (err) => {
        toast.error(`Failed to delete feature: ${err.message}`);
      }
    })
  );

  const { data, isLoading: featuresLoading } = useQuery(
    trpc.featureRequest.list.queryOptions(
      {
        workspaceId: activeWorkspaceId!,
        projectId: selectedProjectId!,
        phase: phaseFilter === "all" ? undefined : (phaseFilter as never),
        source: sourceFilter === "all" ? undefined : (sourceFilter as never),
      },
      {
        enabled: !!activeWorkspaceId && !!selectedProjectId,
        // Poll every 10 s so phase / count changes appear without a manual refresh.
        refetchInterval: 10_000,
      }
    )
  );

  const features = data?.items ?? [];

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim() || !activeWorkspaceId) return;
    createProject.mutate({
      workspaceId: activeWorkspaceId,
      name: newProjectName.trim(),
    });
  }

  // No project selected yet but projects exist, or workspace still loading.
  const noProjects = !projectsLoading && projects && projects.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Feature Requests
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Track and manage feature requests across your workflow
          </p>
        </div>
        <Link
          href="/features/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Feature
        </Link>
      </div>

      {/* No projects: inline create form */}
      {noProjects ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            No projects yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project to start tracking feature requests.
          </p>
          <form
            onSubmit={handleCreateProject}
            className="mt-5 flex w-full max-w-sm items-center gap-2"
          >
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              disabled={createProject.isPending}
              className="h-10 flex-1 rounded-xl border border-border bg-secondary/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!newProjectName.trim() || createProject.isPending}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-glow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {createProject.isPending ? "Creating..." : "Create project"}
            </button>
          </form>
          {createProject.error && (
            <p className="mt-2 text-xs text-destructive">
              {createProject.error.message}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <NativeSelect
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="!pr-10 !bg-secondary/50 !h-10"
              aria-label="Select project"
              disabled={projectsLoading || !projects}
            >
              {projectsLoading && <option>Loading projects...</option>}
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="!pr-10 !bg-secondary/50 !h-10"
              aria-label="Filter by phase"
            >
              {phaseFilters.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All Phases" : phaseConfig[p]?.label ?? p}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="!pr-10 !bg-secondary/50 !h-10"
              aria-label="Filter by source"
            >
              {sourceFilters.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All Sources" : sourceLabels[s] ?? s}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Feature Cards */}
          <div className="space-y-3">
            {featuresLoading || projectsLoading || !selectedProjectId ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="mt-4 h-3 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              ))
            ) : features.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No features found
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {phaseFilter !== "all" || sourceFilter !== "all"
                    ? "No features match the selected filters."
                    : "Create your first feature request to get started."}
                </p>
              </div>
            ) : (
              features.map((feature) => {
                const phase = phaseConfig[feature.phase] ?? {
                  label: feature.phase,
                  className:
                    "bg-secondary text-muted-foreground border border-border",
                };
                const authorName =
                  feature.createdBy?.name ||
                  feature.createdBy?.email ||
                  "Unknown";
                return (
                  <Link
                    key={feature.id}
                    href={`/features/${feature.id}`}
                    className="block"
                  >
                    <div className="group cursor-pointer rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                              {feature.title}
                            </h3>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${phase.className}`}
                            >
                              {phase.label}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                            {feature.description}
                          </p>
                          <div className="mt-3">
                            <PhaseProgress phase={feature.phase} />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground/70">
                            <span className="flex items-center gap-1.5">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-foreground">
                                {authorName.charAt(0).toUpperCase()}
                              </span>
                              {authorName}
                            </span>
                            <span>{formatRelativeTime(feature.createdAt)}</span>
                            <span>
                              {sourceLabels[feature.source] ?? feature.source}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-right">
                          <div>
                            <div className="font-display text-sm font-semibold text-foreground">
                              {feature._count.clarifications}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Clarifications
                            </div>
                          </div>
                          <div>
                            <div className="font-display text-sm font-semibold text-foreground">
                              {feature._count.tasks}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Tasks
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (confirm("Are you sure you want to delete this feature request? This action cannot be undone.")) {
                                deleteFeature.mutate({ workspaceId: activeWorkspaceId!, id: feature.id });
                              }
                            }}
                            title="Delete Feature"
                            className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
