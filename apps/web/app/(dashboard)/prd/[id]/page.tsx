"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../../../lib/trpc-react";
import { useWorkspace } from "../../../../lib/workspace-context";

// PRD section definitions — order + display titles.
const SECTIONS: Array<{ key: PRDContentKey; title: string }> = [
  { key: "problemStatement", title: "Problem Statement" },
  { key: "goals", title: "Goals" },
  { key: "nonGoals", title: "Non-Goals" },
  { key: "userStories", title: "User Stories" },
  { key: "acceptanceCriteria", title: "Acceptance Criteria" },
  { key: "edgeCases", title: "Edge Cases" },
  { key: "successMetrics", title: "Success Metrics" },
];

type PRDContentKey =
  | "problemStatement"
  | "goals"
  | "nonGoals"
  | "userStories"
  | "acceptanceCriteria"
  | "edgeCases"
  | "successMetrics";

type PRDContentValue = string | string[] | undefined | null;
type PRDContent = Record<string, PRDContentValue>;

/** Normalize a possibly-array value to a single editable/displayable string. */
function valueToString(value: PRDContentValue): string {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === "string").join("\n");
  }
  if (typeof value === "string") return value;
  return "";
}

/** Whether a value should render as a bullet list. */
function isListValue(value: PRDContentValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") {
    // Treat newline-separated or bullet-prefixed strings as lists.
    return value.includes("\n");
  }
  return false;
}

/** Split a value into list items for rendering. */
function valueToListItems(value: PRDContentValue): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split("\n")
      : [];
  return raw
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter((line) => line.length > 0);
}

export default function PRDEditorPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const params = useParams();
  const featureRequestId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [showHistory, setShowHistory] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  const enabled = !!activeWorkspaceId && !!featureRequestId;

  const {
    data: prd,
    isLoading,
    isError,
    error,
  } = useQuery(
    trpc.prd.getByFeature.queryOptions(
      { workspaceId: activeWorkspaceId!, featureRequestId: featureRequestId! },
      {
        enabled,
        retry: false,
        // Poll so PRD status (DRAFT → APPROVED) updates without a refresh.
        refetchInterval: 10_000,
      }
    )
  );

  const { data: versionHistory } = useQuery(
    trpc.prd.getVersionHistory.queryOptions(
      { workspaceId: activeWorkspaceId!, featureRequestId: featureRequestId! },
      { enabled: enabled && showHistory && !!prd }
    )
  );

  const { data: latestWorkflow } = useQuery(
    trpc.workflow.getLatestForFeature.queryOptions(
      { featureRequestId: featureRequestId!, type: "PRD_GENERATION" },
      { enabled, refetchInterval: 3000 }
    )
  );

  const isGenerating =
    latestWorkflow?.status === "RUNNING" ||
    latestWorkflow?.status === "PENDING";

  const invalidatePrd = () =>
    qc.invalidateQueries({ queryKey: trpc.prd.getByFeature.queryKey() });

  const updatePrd = useMutation(
    trpc.prd.update.mutationOptions({ onSuccess: invalidatePrd })
  );

  const approvePrd = useMutation(
    trpc.prd.approve.mutationOptions({ onSuccess: invalidatePrd })
  );

  const generatePrd = useMutation(
    trpc.featureRequest.triggerPRD.mutationOptions({
      onSuccess: invalidatePrd,
    })
  );

  // Local editable copy of the content (keyed by section).
  const [content, setContent] = useState<PRDContent>({});

  useEffect(() => {
    if (prd?.content && typeof prd.content === "object") {
      setContent(prd.content as PRDContent);
    }
  }, [prd]);

  const isApproved = prd?.status === "APPROVED";

  function handleSectionBlur(key: PRDContentKey, text: string) {
    setEditingSection(null);

    const current = valueToString(content[key]);
    if (text === current) return; // no change
    if (!activeWorkspaceId || !featureRequestId) return;

    // Build a full content object of strings (the update schema requires strings).
    const nextContent: Record<string, string> = {};
    for (const { key: k } of SECTIONS) {
      nextContent[k] = k === key ? text : valueToString(content[k]);
    }

    // Update local state optimistically.
    setContent((prev) => ({ ...prev, [key]: text }));

    updatePrd.mutate({
      workspaceId: activeWorkspaceId,
      featureRequestId,
      content: nextContent as Parameters<
        typeof updatePrd.mutate
      >[0]["content"],
    });
  }

  const notFound = isError && (error as { data?: { code?: string } })?.data?.code === "NOT_FOUND";

  const statusLabel = useMemo(() => {
    if (!prd) return "";
    return prd.status
      .toLowerCase()
      .replace(/_/g, " ");
  }, [prd]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading || isGenerating) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        {isGenerating && (
          <div className="flex animate-pulse items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm font-medium text-primary shadow-sm">
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Generating PRD with AI... This usually takes 15-30 seconds.
          </div>
        )}
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-9 w-80 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Not found / no PRD yet ────────────────────────────────────────────────────
  if (notFound || !prd) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/prd" className="transition-colors hover:text-foreground">
            PRDs
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground">PRD</span>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-teal-500/5 text-primary">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">
            No PRD yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This feature doesn&apos;t have a PRD. Generate one from the answered
            clarifications.
          </p>
          {generatePrd.isError && (
            <p className="mt-2 text-xs text-destructive">
              {generatePrd.error?.message ?? "Failed to generate PRD."}
            </p>
          )}
          {generatePrd.isSuccess ? (
            <p className="mt-5 text-sm text-muted-foreground">
              PRD generation started. This may take a moment — refresh shortly.
            </p>
          ) : (
            <button
              onClick={() =>
                activeWorkspaceId &&
                featureRequestId &&
                generatePrd.mutate({
                  workspaceId: activeWorkspaceId,
                  featureRequestId,
                })
              }
              disabled={generatePrd.isPending || !enabled}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {generatePrd.isPending ? "Generating…" : "Generate PRD"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/prd" className="transition-colors hover:text-foreground">
          PRDs
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-foreground">PRD</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            PRD <span className="text-muted-foreground">— Document</span>
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium capitalize text-amber-400">
              {statusLabel}
            </span>
            <span>
              Updated{" "}
              {new Date(prd.updatedAt as unknown as string).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v5h5" />
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
              <path d="M12 7v5l4 2" />
            </svg>
            {showHistory ? "Hide History" : "Version History"}
          </button>
          <button
            onClick={() =>
              activeWorkspaceId &&
              featureRequestId &&
              approvePrd.mutate({
                workspaceId: activeWorkspaceId,
                featureRequestId,
              })
            }
            disabled={approvePrd.isPending || isApproved || !enabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {isApproved ? "Approved" : approvePrd.isPending ? "Approving…" : "Approve PRD"}
          </button>
        </div>
      </div>

      {/* Version History Panel */}
      {showHistory && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-base font-semibold text-foreground">
              Version History
            </h2>
          </div>
          <div className="space-y-3 p-6">
            {!versionHistory || versionHistory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No previous versions yet.
              </p>
            ) : (
              versionHistory.map((v, i) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-border bg-secondary/30 p-3.5 transition-colors hover:border-primary/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="rounded-lg bg-secondary px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                        v{versionHistory.length - i}
                      </span>
                      <div>
                        <p className="text-sm text-foreground">Previous revision</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(
                            v.createdAt as unknown as string
                          ).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        setCompareVersionId(
                          compareVersionId === v.id ? null : v.id
                        )
                      }
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      {compareVersionId === v.id
                        ? "Hide diff"
                        : "Compare to current"}
                    </button>
                  </div>

                  {compareVersionId === v.id && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      {SECTIONS.map(({ key, title }) => {
                        const oldVal = valueToString(
                          (v.content as PRDContent)?.[key]
                        );
                        const newVal = valueToString(content[key]);
                        const changed = oldVal !== newVal;
                        return (
                          <div key={key}>
                            <div className="mb-1 flex items-center gap-2">
                              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {title}
                              </h4>
                              {changed ? (
                                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
                                  changed
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/60">
                                  unchanged
                                </span>
                              )}
                            </div>
                            {changed ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-muted-foreground">
                                  <p className="mb-1 font-medium text-red-500/80">
                                    This version
                                  </p>
                                  <p className="whitespace-pre-wrap">
                                    {oldVal || "—"}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs text-muted-foreground">
                                  <p className="mb-1 font-medium text-emerald-500/80">
                                    Current
                                  </p>
                                  <p className="whitespace-pre-wrap">
                                    {newVal || "—"}
                                  </p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {updatePrd.isError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {updatePrd.error?.message ?? "Failed to save changes."}
        </div>
      )}

      {/* PRD Sections (Notion-style block editor) */}
      <div className="space-y-3">
        {SECTIONS.map(({ key, title }) => {
          const value = content[key];
          const renderAsList = isListValue(value);
          return (
            <div
              key={key}
              className="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/20"
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-primary to-teal-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {title}
                </h3>
                {editingSection !== key && !isApproved && (
                  <svg
                    className="h-3.5 w-3.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/60"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
              </div>
              {editingSection === key ? (
                <div className="space-y-2">
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) =>
                      handleSectionBlur(key, e.currentTarget.textContent || "")
                    }
                    className="min-h-[80px] w-full whitespace-pre-wrap rounded-xl border border-primary/40 bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none ring-2 ring-primary/20"
                  >
                    {valueToString(value)}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Click outside to save changes
                  </p>
                </div>
              ) : (
                <div
                  onClick={() => !isApproved && setEditingSection(key)}
                  className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground transition-colors ${
                    isApproved
                      ? ""
                      : "cursor-text hover:bg-secondary/50"
                  }`}
                >
                  {renderAsList ? (
                    <ul className="space-y-1.5">
                      {valueToListItems(value).map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : valueToString(value) ? (
                    <p>{valueToString(value)}</p>
                  ) : (
                    <span className="text-muted-foreground/50">
                      Empty — click to add content.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
