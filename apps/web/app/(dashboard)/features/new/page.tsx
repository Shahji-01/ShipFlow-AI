"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../../lib/trpc-react";
import { useWorkspace } from "../../../../lib/workspace-context";

const sourceOptions = [
  { value: "WEB", label: "Web" },
  { value: "EMAIL", label: "Email" },
  { value: "SUPPORT_TICKET", label: "Support Ticket" },
  { value: "CUSTOMER_SERVICE", label: "Customer Service" },
] as const;

const inputClass =
  "w-full rounded-xl border border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 disabled:opacity-50";

export default function NewFeaturePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();

  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<string>("WEB");
  const [errors, setErrors] = useState<{ title?: string; description?: string }>(
    {}
  );
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects, isLoading: projectsLoading } = useQuery(
    trpc.project.list.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled: !!activeWorkspaceId }
    )
  );

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setProjectId((prev) => {
      if (prev && projects.some((p) => p.id === prev)) return prev;
      return projects[0]!.id;
    });
  }, [projects]);

  const createProject = useMutation(
    trpc.project.create.mutationOptions({
      onSuccess: (project) => {
        qc.invalidateQueries({ queryKey: trpc.project.list.queryKey() });
        setProjectId(project.id);
        setNewProjectName("");
      },
    })
  );

  const createFeature = useMutation(
    trpc.featureRequest.create.mutationOptions({
      onSuccess: (fr) => {
        qc.invalidateQueries({ queryKey: trpc.featureRequest.list.queryKey() });
        router.push(`/features/${fr.id}`);
      },
    })
  );

  function validate() {
    const newErrors: { title?: string; description?: string } = {};
    const t = title.trim();
    const d = description.trim();
    if (!t) {
      newErrors.title = "Title is required";
    } else if (t.length > 200) {
      newErrors.title = "Title cannot exceed 200 characters";
    }
    if (!d) {
      newErrors.description = "Description is required";
    } else if (d.length > 5000) {
      newErrors.description = "Description cannot exceed 5000 characters";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!activeWorkspaceId || !projectId) return;
    createFeature.mutate({
      workspaceId: activeWorkspaceId,
      projectId,
      title: title.trim(),
      description: description.trim(),
      source: source as never,
    });
  }

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim() || !activeWorkspaceId) return;
    createProject.mutate({
      workspaceId: activeWorkspaceId,
      name: newProjectName.trim(),
    });
  }

  const isSubmitting = createFeature.isPending;
  const noProjects = !projectsLoading && projects && projects.length === 0;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Page Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Submit Feature Request
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Describe the feature you&apos;d like to build. AI will analyze completeness.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-start gap-3 border-b border-border px-6 py-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/5 text-primary">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l2.4 5.4L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-1.6z" />
            </svg>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              Feature Details
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Provide a clear title and detailed description for the AI to analyze
            </p>
          </div>
        </div>

        {noProjects ? (
          <div className="space-y-4 p-6">
            <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-center">
              <p className="text-sm font-medium text-foreground">
                Create a project first
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Feature requests belong to a project. Create one to continue.
              </p>
              <form
                onSubmit={handleCreateProject}
                className="mt-4 flex items-center gap-2"
              >
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  disabled={createProject.isPending}
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={!newProjectName.trim() || createProject.isPending}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient px-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {createProject.isPending ? "Creating..." : "Create"}
                </button>
              </form>
              {createProject.error && (
                <p className="mt-2 text-xs text-destructive">
                  {createProject.error.message}
                </p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <label
                  htmlFor="feature-project"
                  className="text-sm font-medium text-foreground"
                >
                  Project
                </label>
                <select
                  id="feature-project"
                  value={projectId ?? ""}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={isSubmitting || projectsLoading || !projects}
                  className={`${inputClass} pr-8`}
                >
                  {projectsLoading && <option>Loading projects...</option>}
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-title"
                  className="text-sm font-medium text-foreground"
                >
                  Title
                </label>
                <input
                  id="feature-title"
                  placeholder="e.g., OAuth2 Social Login"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSubmitting}
                  maxLength={200}
                  className={inputClass}
                />
                {errors.title && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.title}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {title.length}/200 characters
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-description"
                  className="text-sm font-medium text-foreground"
                >
                  Description
                </label>
                <textarea
                  id="feature-description"
                  placeholder="Describe the feature in detail: what problem it solves, who benefits, and any constraints..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  rows={6}
                  maxLength={5000}
                  className={`${inputClass} resize-y leading-relaxed`}
                />
                {errors.description && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {description.length}/5000 characters
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="feature-source"
                  className="text-sm font-medium text-foreground"
                >
                  Source
                </label>
                <select
                  id="feature-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={isSubmitting}
                  className={`${inputClass} pr-8`}
                >
                  {sourceOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {createFeature.error && (
                <p className="flex items-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {createFeature.error.message}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-secondary/50 px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !projectId}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                      </svg>
                      Submitting...
                    </>
                  ) : (
                    "Submit Feature"
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
