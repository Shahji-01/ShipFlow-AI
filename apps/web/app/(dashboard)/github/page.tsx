"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

const selectClass =
  "h-10 rounded-xl border border-border bg-secondary/50 px-3 pr-8 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:border-primary/30 disabled:opacity-50";

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function GitHubSettingsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [showPicker, setShowPicker] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Whether the signed-in user's GitHub link actually grants repo access.
  const { data: connections, isLoading: connLoading } = useQuery(
    trpc.user.connections.queryOptions()
  );
  const repoAccess = !!connections?.githubRepoAccess;

  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId }
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
      { enabled: !!activeWorkspaceId && !!selectedProjectId }
    )
  );

  // Available GitHub repos to connect — only fetched once the user opens the
  // picker (avoids hitting the GitHub API on every page load).
  const { data: availableRepos, isLoading: availableLoading, error: availableError } =
    useQuery(
      trpc.github.listAvailableRepos.queryOptions(
        { workspaceId: activeWorkspaceId! },
        { enabled: !!activeWorkspaceId && repoAccess && showPicker }
      )
    );

  const connectedFullNames = useMemo(
    () => new Set((repos ?? []).map((r) => r.fullName)),
    [repos]
  );

  const filteredAvailable = useMemo(() => {
    const list = (availableRepos ?? []).filter(
      (r) => !connectedFullNames.has(r.fullName)
    );
    const q = repoSearch.trim().toLowerCase();
    return q
      ? list.filter((r) => r.fullName.toLowerCase().includes(q))
      : list;
  }, [availableRepos, connectedFullNames, repoSearch]);

  function invalidateRepos() {
    if (activeWorkspaceId && selectedProjectId) {
      qc.invalidateQueries({
        queryKey: trpc.github.listRepos.queryKey({
          workspaceId: activeWorkspaceId,
          projectId: selectedProjectId,
        }),
      });
    }
  }

  const connectRepo = useMutation(
    trpc.github.connectRepo.mutationOptions({
      onSuccess: () => {
        setActionError(null);
        invalidateRepos();
      },
      onError: (e) => setActionError(e.message),
    })
  );

  const disconnectRepo = useMutation(
    trpc.github.disconnectRepo.mutationOptions({
      onSuccess: () => {
        setActionError(null);
        invalidateRepos();
      },
      onError: (e) => setActionError(e.message),
    })
  );

  const syncPRs = useMutation(
    trpc.github.syncPRs.mutationOptions({
      onSuccess: (res) => {
        setActionError(null);
        setSyncMsg(`Synced ${res.synced} pull request${res.synced === 1 ? "" : "s"}.`);
        setTimeout(() => setSyncMsg(null), 4000);
      },
      onError: (e) => setActionError(e.message),
    })
  );

  const noProjects = !projectsLoading && projects && projects.length === 0;
  const connectingName =
    connectRepo.isPending && connectRepo.variables
      ? (connectRepo.variables as { repoFullName: string }).repoFullName
      : null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          GitHub Integration
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect and manage your GitHub repositories for PR reviews
        </p>
      </div>

      {/* GitHub not authorized for repo access */}
      {!connLoading && !repoAccess && (
        <Card className="border border-border bg-card">
          <CardContent className="p-6">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <InfoIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    GitHub repository access required
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {connections?.github
                      ? "Your GitHub account is linked for sign-in but hasn't granted repository access. Reconnect it to authorize repositories."
                      : "Connect your GitHub account to authorize ShipFlow to access repositories."}
                  </p>
                  <Link
                    href="/settings"
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5"
                  >
                    {connections?.github ? "Reconnect in Settings" : "Connect in Settings"}
                  </Link>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {repoAccess && noProjects ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
            <GitHubRepoIcon className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            No projects yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project first to connect repositories.
          </p>
          <Link
            href="/workspace"
            className="mt-5 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Go to Workspace
          </Link>
        </div>
      ) : repoAccess ? (
        <>
          {/* Project selector */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted-foreground">Project</label>
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
          </div>

          {actionError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              {actionError}
            </div>
          )}
          {syncMsg && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-500">
              {syncMsg}
            </div>
          )}

          {/* Connected Repositories */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-lg">
                  Connected Repositories
                </CardTitle>
                <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <span className="text-xs font-medium text-emerald-400">
                    GitHub Connected
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {reposLoading || !selectedProjectId ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                      <div>
                        <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                  </div>
                ))
              ) : !repos || repos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border py-12 text-center">
                  <GitHubRepoIcon className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    No repositories connected
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect a repository below to start running PR reviews.
                  </p>
                </div>
              ) : (
                repos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-4 transition-all hover:border-primary/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background">
                        <GitHubRepoIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {repo.fullName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Connected {formatDate(repo.connectedAt)} · Default
                          branch:{" "}
                          <span className="font-mono">{repo.defaultBranch}</span>
                          {repo.webhookId ? null : " · webhook pending"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          activeWorkspaceId &&
                          syncPRs.mutate({
                            workspaceId: activeWorkspaceId,
                            repositoryId: repo.id,
                          })
                        }
                        disabled={syncPRs.isPending}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                      >
                        {syncPRs.isPending &&
                        (syncPRs.variables as { repositoryId: string } | undefined)
                          ?.repositoryId === repo.id
                          ? "Syncing…"
                          : "Sync PRs"}
                      </button>
                      <button
                        onClick={() => {
                          if (
                            activeWorkspaceId &&
                            confirm(`Disconnect ${repo.fullName}?`)
                          ) {
                            disconnectRepo.mutate({
                              workspaceId: activeWorkspaceId,
                              repositoryId: repo.id,
                            });
                          }
                        }}
                        disabled={disconnectRepo.isPending}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-60"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Connect a repository */}
          <Card className="border border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-display text-lg">
                  Connect a repository
                </CardTitle>
                {!showPicker && (
                  <button
                    onClick={() => setShowPicker(true)}
                    disabled={!selectedProjectId}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-gradient px-4 text-sm font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 disabled:opacity-60"
                  >
                    Browse my repositories
                  </button>
                )}
              </div>
            </CardHeader>
            {showPicker && (
              <CardContent className="space-y-4">
                <input
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repositories…"
                  className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />

                {availableLoading ? (
                  <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground">
                    <Spinner /> Loading your GitHub repositories…
                  </div>
                ) : availableError ? (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                    {availableError.message}
                  </p>
                ) : filteredAvailable.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {(availableRepos?.length ?? 0) === 0
                      ? "No repositories found for your account."
                      : "No repositories match — or all are already connected."}
                  </p>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {filteredAvailable.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 p-3"
                      >
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                            {r.fullName}
                            {r.private && (
                              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                private
                              </span>
                            )}
                          </p>
                          {r.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {r.description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            activeWorkspaceId &&
                            selectedProjectId &&
                            connectRepo.mutate({
                              workspaceId: activeWorkspaceId,
                              projectId: selectedProjectId,
                              repoFullName: r.fullName,
                            })
                          }
                          disabled={connectRepo.isPending}
                          className="ml-3 inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient px-3 text-xs font-semibold text-white shadow-glow transition-all hover:-translate-y-0.5 disabled:opacity-60"
                        >
                          {connectingName === r.fullName ? "Connecting…" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  );
}

function GitHubRepoIcon({ className }: { className?: string }) {
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
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
