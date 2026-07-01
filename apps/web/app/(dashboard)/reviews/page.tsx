"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

const statusColors: Record<string, string> = {
  OPEN: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  CLOSED: "bg-red-500/10 text-red-400 border border-red-500/20",
  MERGED: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
};

const statusFilters = ["all", "OPEN", "CLOSED", "MERGED"] as const;

const selectClass =
  "h-10 rounded-xl border border-border bg-secondary/50 px-3 pr-8 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/30 disabled:opacity-50";

export default function ReviewsPage() {
  const trpc = useTRPC();
  const { activeWorkspaceId } = useWorkspace();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<(typeof statusFilters)[number]>("all");

  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId, refetchInterval: 15_000 }
    )
  );

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setSelectedProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      return projects[0]!.id;
    });
  }, [projects]);

  const { data: repos, isLoading: reposLoading } = useQuery(
    trpc.github.listRepos.queryOptions(
      { workspaceId: activeWorkspaceId!, projectId: selectedProjectId! },
      { enabled: !!activeWorkspaceId && !!selectedProjectId, refetchInterval: 15_000 }
    )
  );

  // Reset/default the selected repo when the repo list changes.
  useEffect(() => {
    setSelectedRepoId((prev) => {
      if (!repos || repos.length === 0) return null;
      if (prev && repos.some((r) => r.id === prev)) return prev;
      return repos[0]!.id;
    });
  }, [repos]);

  const { data: pullRequests, isLoading: prsLoading } = useQuery(
    trpc.github.listPRs.queryOptions(
      {
        workspaceId: activeWorkspaceId!,
        repositoryId: selectedRepoId!,
        status: statusFilter === "all" ? undefined : statusFilter,
      },
      {
        enabled: !!activeWorkspaceId && !!selectedRepoId,
        // PRs and their review statuses change frequently — poll every 10 s.
        refetchInterval: 10_000,
      }
    )
  );

  const noProjects = !projectsLoading && projects && projects.length === 0;
  const noRepos =
    !reposLoading && !!selectedProjectId && repos && repos.length === 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          PR Reviews
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-powered code reviews for your pull requests
        </p>
      </div>

      {noProjects ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No projects yet. Create a project to start reviewing pull requests.
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedProjectId ?? ""}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className={selectClass}
              aria-label="Select project"
              disabled={projectsLoading || !projects}
            >
              {projectsLoading && <option>Loading projects...</option>}
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={selectedRepoId ?? ""}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              className={selectClass}
              aria-label="Select repository"
              disabled={reposLoading || !repos || repos.length === 0}
            >
              {reposLoading && <option>Loading repositories...</option>}
              {!reposLoading && (!repos || repos.length === 0) && (
                <option value="">No repositories</option>
              )}
              {repos?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as (typeof statusFilters)[number])
              }
              className={selectClass}
              aria-label="Filter by status"
            >
              {statusFilters.map((s) => (
                <option key={s} value={s}>
                  {s === "all"
                    ? "All Status"
                    : s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          {/* PR List */}
          <div className="space-y-3">
            {noRepos ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                No repositories connected to this project yet.{" "}
                <Link
                  href="/github"
                  className="font-medium text-primary hover:underline"
                >
                  Connect one from the GitHub page
                </Link>
                .
              </div>
            ) : prsLoading || reposLoading || !selectedRepoId ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              ))
            ) : !pullRequests || pullRequests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                {statusFilter !== "all"
                  ? "No pull requests match the selected filter."
                  : "No pull requests found for this repository."}
              </div>
            ) : (
              pullRequests.map((pr) => (
                <Link key={pr.id} href={`/reviews/${pr.id}`} className="block">
                  <Card className="cursor-pointer border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-foreground">
                              <span className="text-muted-foreground">
                                #{pr.number}
                              </span>{" "}
                              {pr.title}
                            </h3>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                statusColors[pr.status] ??
                                "bg-secondary text-muted-foreground border border-border"
                              }`}
                            >
                              {pr.status.toLowerCase()}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-mono">{pr.branchName}</span>
                            {pr.task ? (
                              <>
                                {" · "}
                                Task: {pr.task.title}
                              </>
                            ) : (
                              " · No linked task"
                            )}
                          </p>
                        </div>
                        <svg
                          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
