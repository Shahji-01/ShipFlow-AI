"use client";
import dynamic from "next/dynamic";
import React from "react";

const WorkflowPlayer = dynamic(() => import("./WorkflowPlayer"), {
  ssr: false,
  loading: () => (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-card"
      style={{ aspectRatio: "16/9" }}
    >
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary">
            <svg className="h-8 w-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <span className="text-sm text-muted-foreground">Loading workflow animation…</span>
        </div>
      </div>
    </div>
  ),
});

export default function WorkflowPlayerDynamic() {
  return <WorkflowPlayer />;
}
