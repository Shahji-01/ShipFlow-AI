"use client";

import * as React from "react";
import { cn } from "@shipflow/ui";
import { Sidebar } from "../../components/dashboard/sidebar";
import { TopBar } from "../../components/dashboard/top-bar";
import { CommandPalette } from "../../components/dashboard/command-palette";
import { WorkspaceProvider, useWorkspace } from "../../lib/workspace-context";
import { OnboardingGate } from "../../components/dashboard/onboarding-gate";

const SIDEBAR_STORAGE_KEY = "shipflow-sidebar-collapsed";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { isLoading, workspaces } = useWorkspace();

  // Load sidebar state from localStorage
  React.useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored !== null) {
      setSidebarCollapsed(stored === "true");
    }
  }, []);

  function toggleSidebar() {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(newState));
  }

  // While loading workspaces, show a minimal splash.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-8 w-8 animate-spin text-primary"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  // No workspaces yet → onboarding.
  if (workspaces.length === 0) {
    return <OnboardingGate />;
  }

  return (
    <div className="min-h-screen bg-transparent">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - hidden on mobile, visible on desktop */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile sidebar drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
      </div>

      {/* Main content area */}
      <div
        className={cn(
          "flex flex-col transition-all duration-300 ease-in-out",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
        )}
      >
        <TopBar
          onToggleSidebar={() => {
            // On mobile, open the drawer; on desktop, collapse
            if (window.innerWidth < 1024) {
              setMobileOpen(!mobileOpen);
            } else {
              toggleSidebar();
            }
          }}
          sidebarCollapsed={sidebarCollapsed}
        />

        {/* Main scroll region with ambient gradient glow */}
        <main className="relative flex-1">
          {/* Ambient gradient glow at the top of the content area */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-64 overflow-hidden"
            aria-hidden="true"
          >
            <div className="absolute left-1/2 top-0 h-64 w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-radial from-primary/20 via-primary/5 to-transparent blur-3xl" />
          </div>

          <div className="relative z-[1] mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Command Palette (global modal) */}
      <CommandPalette />
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}
