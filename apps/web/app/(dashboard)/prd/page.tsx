"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

// FeaturePhase enum values mapped to display labels + styles.
type FeaturePhase =
  | "DISCOVERY"
  | "PLANNING"
  | "DEVELOPMENT"
  | "AI_REVIEW"
  | "HUMAN_APPROVAL"
  | "SHIPPED"
  | "FIX_NEEDED";

const phaseConfig: Record<FeaturePhase, { label: string; className: string }> = {
  DISCOVERY: {
    label: "Discovery",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  },
  PLANNING: {
    label: "Planning",
    className: "border-violet-500/20 bg-violet-500/10 text-violet-500",
  },
  DEVELOPMENT: {
    label: "Development",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-500",
  },
  AI_REVIEW: {
    label: "AI Review",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-500",
  },
  HUMAN_APPROVAL: {
    label: "Human Approval",
    className: "border-rose-500/20 bg-rose-500/10 text-rose-500",
  },
  SHIPPED: {
    label: "Shipped",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  },
  FIX_NEEDED: {
    label: "Fix Needed",
    className: "border-rose-500/20 bg-rose-500/10 text-rose-500",
  },
};

const phaseFilters: Array<{ value: "all" | FeaturePhase; label: string }> = [
  { value: "all", label: "All Phases" },
  { value: "PLANNING", label: "Planning" },
  { value: "DEVELOPMENT", label: "Development" },
  { value: "AI_REVIEW", label: "AI Review" },
  { value: "HUMAN_APPROVAL", label: "Human Approval" },
  { value: "SHIPPED", label: "Shipped" },
];

export default function PRDListPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId } = useWorkspace();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<"all" | FeaturePhase>("all");

  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId, refetchInterval: 15_000 }
    )
  );

  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [projects, selectedProjectId]);

  const { data: featureData, isLoading: featuresLoading } = useQuery(
    trpc.featureRequest.list.queryOptions(
      { workspaceId: activeWorkspaceId!, projectId: selectedProjectId! },
      {
        enabled: !!activeWorkspaceId && !!selectedProjectId,
        refetchInterval: 10_000,
      }
    )
  );

  // Features past DISCOVERY likely have a PRD.
  const features = (featureData?.items ?? []).filter(
    (f) => f.phase !== "DISCOVERY"
  );

  const filtered = features.filter(
    (f) => phaseFilter === "all" || f.phase === phaseFilter
  );

  const isLoading = projectsLoading || featuresLoading;

  const selectClass =
    "h-10 rounded-lg border border-border bg-card px-3 pr-8 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            PRDs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Product requirement documents generated and refined by AI
          </p>
        </div>
        <Link
          href="/features/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-notion transition-colors hover:bg-primary/90"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New PRD
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={selectedProjectId ?? ""}
          onChange={(e) => setSelectedProjectId(e.target.value || null)}
          disabled={projectsLoading || !projects || projects.length === 0}
          className={selectClass}
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
        </select>

        <select
          value={phaseFilter}
          onChange={(e) =>
            setPhaseFilter(e.target.value as "all" | FeaturePhase)
          }
          className={selectClass}
          aria-label="Filter by phase"
        >
          {phaseFilters.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Loading skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-full rounded-xl border border-border bg-card p-5 shadow-notion"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              </div>
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-3 w-1/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* PRD Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((feature) => {
              const phase = phaseConfig[feature.phase as FeaturePhase];
              return (
                <Link key={feature.id} href={`/prd/${feature.id}`}>
                  <article className="group h-full rounded-xl border border-border bg-card p-5 shadow-notion transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-notion-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-primary">
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </span>
                        <h3 className="font-display text-base font-semibold text-foreground">
                          {feature.title}
                        </h3>
                      </div>
                      {phase && (
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${phase.className}`}
                        >
                          {phase.label}
                        </span>
                      )}
                    </div>

                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
                    </p>

                    <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                      {feature.createdBy?.name && (
                        <span>{feature.createdBy.name}</span>
                      )}
                      <span className="ml-auto">
                        {new Date(feature.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">
                No PRDs found
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {!projects || projects.length === 0
                  ? "Create a project and feature to get started."
                  : "No features with PRDs match the selected filter."}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
