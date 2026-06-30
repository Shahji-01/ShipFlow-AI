"use client";

import React from "react";
import { Button } from "@shipflow/ui";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-destructive/20 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10">
          <AlertCircleIcon className="h-9 w-9 text-destructive" />
        </div>
      </div>
      <h2 className="mt-6 font-display text-2xl font-semibold text-foreground">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">
        We encountered an error loading this page. Your previously entered data
        has been preserved where possible. Please try again.
      </p>
      {error.message && (
        <p className="mt-4 max-w-md truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
      )}
      <div className="mt-8 flex gap-3">
        <Button
          onClick={reset}
          className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
        >
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload Page
        </Button>
      </div>
    </div>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
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
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
