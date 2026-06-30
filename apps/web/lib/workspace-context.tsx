"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "./trpc-react";

const STORAGE_KEY = "shipflow-active-workspace";

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface WorkspaceContextValue {
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
  activeWorkspaceId: string | null;
  setActiveWorkspaceId: (id: string) => void;
  isLoading: boolean;
}

const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC();
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const { data: workspaces = [], isLoading } = useQuery(
    trpc.workspace.list.queryOptions()
  );

  // Restore persisted selection / default to first workspace.
  React.useEffect(() => {
    if (workspaces.length === 0) return;
    const stored =
      typeof window !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    const valid = stored && workspaces.some((w) => w.id === stored);
    setActiveId(valid ? stored : (workspaces[0]?.id ?? null));
  }, [workspaces]);

  const setActiveWorkspaceId = React.useCallback((id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activeWorkspace =
    workspaces.find((w) => w.id === activeId) ?? null;

  const value: WorkspaceContextValue = {
    workspaces: workspaces as WorkspaceSummary[],
    activeWorkspace: activeWorkspace as WorkspaceSummary | null,
    activeWorkspaceId: activeId,
    setActiveWorkspaceId,
    isLoading,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = React.useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
