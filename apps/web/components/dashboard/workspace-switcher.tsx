"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@shipflow/ui";
import { useWorkspace } from "../../lib/workspace-context";

interface WorkspaceSwitcherProps {
  collapsed: boolean;
}

function getWorkspaceInitial(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeName = activeWorkspace?.name ?? "Select workspace";
  const activeInitial = activeWorkspace
    ? getWorkspaceInitial(activeWorkspace.name)
    : "?";

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg p-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary",
          collapsed && "justify-center"
        )}
        aria-label="Switch workspace"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-xs font-bold text-primary-foreground shadow-sm">
          {activeInitial}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{activeName}</span>
            <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl animate-slide-in-from-top-2">
          <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspaces
          </div>
          {workspaces.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No workspaces yet
            </div>
          ) : (
            workspaces.map((workspace) => {
              const isActive = activeWorkspace?.id === workspace.id;
              return (
                <button
                  key={workspace.id}
                  onClick={() => {
                    setActiveWorkspaceId(workspace.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  role="option"
                  aria-selected={isActive}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-xs font-bold text-primary-foreground">
                    {getWorkspaceInitial(workspace.name)}
                  </span>
                  <span className="truncate">{workspace.name}</span>
                  {isActive && (
                    <CheckIcon className="ml-auto h-4 w-4 text-primary" />
                  )}
                </button>
              );
            })
          )}
          <div className="mt-1 border-t border-border px-3 py-2">
            <Link
              href="/workspace/new"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <PlusIcon className="h-4 w-4" />
              <span>Create workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Inline SVG Icons ───────────────────────────────────────── */

function ChevronUpDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="7,10 12,6 17,10" />
      <polyline points="7,14 12,18 17,14" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
