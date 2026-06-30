"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@shipflow/ui";
import { useTRPC } from "../../../lib/trpc-react";
import { useWorkspace } from "../../../lib/workspace-context";

type Role = "ADMIN" | "MEMBER" | "APPROVER";

const ROLES: Role[] = ["ADMIN", "MEMBER", "APPROVER"];

const roleColors: Record<Role, string> = {
  ADMIN: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  APPROVER: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  MEMBER: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
};

const avatarGradients: Record<Role, string> = {
  ADMIN: "from-primary to-teal-400",
  APPROVER: "from-amber-500 to-orange-500",
  MEMBER: "from-cyan-500 to-blue-500",
};

function getInitials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function WorkspaceSettingsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const isAdmin = activeWorkspace?.role === "ADMIN";
  const enabled = !!activeWorkspaceId;

  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("MEMBER");

  const {
    data: workspace,
    isLoading: workspaceLoading,
    isError: workspaceError,
  } = useQuery(
    trpc.workspace.getById.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled }
    )
  );

  useEffect(() => {
    if (workspace?.name) setWorkspaceName(workspace.name);
  }, [workspace?.name]);

  const {
    data: members,
    isLoading: membersLoading,
    isError: membersError,
  } = useQuery(
    trpc.workspace.listMembers.queryOptions(
      { workspaceId: activeWorkspaceId! },
      { enabled }
    )
  );

  function invalidateMembers() {
    qc.invalidateQueries({ queryKey: trpc.workspace.listMembers.queryKey() });
  }

  const updateWorkspace = useMutation(
    trpc.workspace.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.workspace.getById.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
      },
    })
  );

  const invite = useMutation(
    trpc.workspace.invite.mutationOptions({
      onSuccess: () => {
        setInviteEmail("");
        setInviteRole("MEMBER");
        invalidateMembers();
      },
    })
  );

  const updateMemberRole = useMutation(
    trpc.workspace.updateMemberRole.mutationOptions({
      onSuccess: invalidateMembers,
    })
  );

  const removeMember = useMutation(
    trpc.workspace.removeMember.mutationOptions({
      onSuccess: invalidateMembers,
    })
  );

  function handleSaveName() {
    if (!activeWorkspaceId || !workspaceName.trim()) return;
    updateWorkspace.mutate({
      workspaceId: activeWorkspaceId,
      name: workspaceName.trim(),
    });
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !inviteEmail.trim() || invite.isPending) return;
    invite.mutate({
      workspaceId: activeWorkspaceId,
      email: inviteEmail.trim(),
      role: inviteRole,
    });
  }

  // ── No workspace selected ───────────────────────────────────────────────
  if (!activeWorkspaceId) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader />
        <Card className="border border-border bg-card">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Select a workspace to manage its settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader />

      {/* Workspace Name */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display">General</CardTitle>
          <CardDescription>Update your workspace name and details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workspaceLoading ? (
            <div className="h-10 w-full max-w-sm animate-pulse rounded-lg bg-muted" />
          ) : workspaceError ? (
            <p className="text-sm text-destructive">
              Failed to load workspace details.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="max-w-sm"
                  disabled={!isAdmin || updateWorkspace.isPending}
                />
              </div>
              {isAdmin ? (
                <div className="flex items-center gap-3">
                  <Button
                    className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                    onClick={handleSaveName}
                    disabled={
                      updateWorkspace.isPending ||
                      !workspaceName.trim() ||
                      workspaceName.trim() === workspace?.name
                    }
                  >
                    {updateWorkspace.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  {updateWorkspace.isSuccess && (
                    <span className="text-sm text-emerald-500">Saved</span>
                  )}
                  {updateWorkspace.isError && (
                    <span className="text-sm text-destructive">
                      {updateWorkspace.error.message}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Only workspace admins can change these settings.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Invite Members (ADMIN only) */}
      {isAdmin && (
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="font-display">Invite Members</CardTitle>
            <CardDescription>
              Add team members to collaborate on features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <Input
                  placeholder="email@example.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={invite.isPending}
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                aria-label="Select role"
                disabled={invite.isPending}
              >
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
                <option value="APPROVER">Approver</option>
              </select>
              <Button
                type="submit"
                className="bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                disabled={invite.isPending || !inviteEmail.trim()}
              >
                {invite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </form>
            {invite.isError && (
              <p className="mt-3 text-sm text-destructive">{invite.error.message}</p>
            )}
            {invite.isSuccess && (
              <p className="mt-3 text-sm text-emerald-500">Invitation sent.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Members List */}
      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display">Team Members</CardTitle>
          <CardDescription>
            {members ? `${members.length} members in this workspace` : "Workspace members"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : membersError ? (
            <p className="text-sm text-destructive">Failed to load members.</p>
          ) : !members || members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((member) => {
                const role = member.role as Role;
                const name = member.user.name || member.user.email;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white ${avatarGradients[role]}`}
                      >
                        {getInitials(member.user.name, member.user.email)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isAdmin ? (
                        <select
                          value={role}
                          onChange={(e) =>
                            updateMemberRole.mutate({
                              workspaceId: activeWorkspaceId,
                              memberId: member.id,
                              role: e.target.value as Role,
                            })
                          }
                          disabled={updateMemberRole.isPending}
                          aria-label={`Role for ${name}`}
                          className="rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.charAt(0) + r.slice(1).toLowerCase()}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColors[role]}`}
                        >
                          {role.toLowerCase()}
                        </span>
                      )}
                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                          onClick={() =>
                            removeMember.mutate({
                              workspaceId: activeWorkspaceId,
                              memberId: member.id,
                            })
                          }
                          disabled={removeMember.isPending}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(updateMemberRole.isError || removeMember.isError) && (
            <p className="mt-3 text-sm text-destructive">
              {updateMemberRole.error?.message || removeMember.error?.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
        Workspace Settings
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your workspace settings and team members
      </p>
    </div>
  );
}
