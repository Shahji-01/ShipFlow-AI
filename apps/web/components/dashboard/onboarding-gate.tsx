"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "../../lib/trpc-react";

/**
 * Shown when the authenticated user belongs to no workspace.
 * Lets them create their first workspace to bootstrap the product.
 */
export function OnboardingGate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.workspace.list.queryKey(),
        });
      },
      onError: (e) => setError(e.message),
    })
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter a workspace name.");
      return;
    }
    createWorkspace.mutate({ name: name.trim() });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="bg-dot pointer-events-none absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-notion">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Welcome to ShipFlow
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create your first workspace to start shipping features with AI.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card p-6 shadow-notion-lg"
        >
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <label htmlFor="ws-name" className="text-sm font-medium text-foreground">
            Workspace name
          </label>
          <input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
            autoFocus
            disabled={createWorkspace.isPending}
            className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            You can invite teammates and rename it later.
          </p>
          <button
            type="submit"
            disabled={createWorkspace.isPending || !name.trim()}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-notion transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {createWorkspace.isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating…
              </>
            ) : (
              "Create workspace"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
