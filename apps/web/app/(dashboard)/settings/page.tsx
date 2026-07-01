"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, signOut, authClient } from "@shipflow/auth/client";
import { useTRPC } from "../../../lib/trpc-react";
import { useTheme } from "../../../lib/theme-context";
import { useWorkspace } from "../../../lib/workspace-context";

const NOTIFICATION_ITEMS = [
  {
    key: "aiReviewComplete",
    title: "AI review completed",
    desc: "When the QA agent finishes reviewing a pull request",
  },
  {
    key: "approvalRequested",
    title: "Approval requested",
    desc: "When a feature is ready for your human approval",
  },
  {
    key: "featureShipped",
    title: "Feature shipped",
    desc: "When a feature is approved and marked as shipped",
  },
  {
    key: "weeklyDigest",
    title: "Weekly digest",
    desc: "A summary of your workspace activity every Monday",
  },
  {
    key: "productUpdates",
    title: "Product updates",
    desc: "News about new ShipFlow features and improvements",
  },
] as const;

const DEFAULT_NOTIFS: Record<string, boolean> = {
  aiReviewComplete: true,
  approvalRequested: true,
  featureShipped: true,
  weeklyDigest: false,
  productUpdates: false,
};

type TabId = "profile" | "account" | "notifications" | "appearance" | "integrations";

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  {
    id: "profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: "account",
    label: "Account",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
      </svg>
    ),
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-primary" : "bg-secondary"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  // Deep-link support: /settings?tab=account (and the /settings/[tab] redirect,
  // so URLs like /settings/profile resolve to the right tab instead of 404ing).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.id === t)) setActiveTab(t as TabId);
  }, []);

  const { data: me, isLoading: meLoading } = useQuery(
    trpc.user.me.queryOptions()
  );

  const { data: connections } = useQuery(trpc.user.connections.queryOptions());
  // A GitHub link is only truly "connected" for ShipFlow's purposes when it
  // carries repo access. An identity-only link is treated as not connected.
  const githubLinked = !!connections?.github;
  const githubConnected = !!connections?.githubRepoAccess;

  const sessionUser = session?.user;
  const displayName = me?.name || sessionUser?.name || "ShipFlow User";
  const email = me?.email || sessionUser?.email || "user@example.com";

  // Profile form state
  const [name, setName] = useState("");

  useEffect(() => {
    if (me?.name !== undefined && me?.name !== null) setName(me.name);
  }, [me?.name]);

  // Notification preferences (synced from user.me)
  const [notifs, setNotifs] = useState<Record<string, boolean>>(DEFAULT_NOTIFS);

  useEffect(() => {
    if (me?.notificationPrefs && typeof me.notificationPrefs === "object") {
      setNotifs({
        ...DEFAULT_NOTIFS,
        ...(me.notificationPrefs as Record<string, boolean>),
      });
    }
  }, [me?.notificationPrefs]);

  // Appearance
  const { theme, setTheme } = useTheme();

  // Integrations — Slack (workspace-scoped)
  const { activeWorkspaceId } = useWorkspace();
  const [slackUrl, setSlackUrl] = useState("");

  const { data: workspace } = useQuery(
    trpc.workspace.getById.queryOptions(
      { workspaceId: activeWorkspaceId ?? "" },
      { enabled: !!activeWorkspaceId }
    )
  );

  const setSlackWebhook = useMutation(
    trpc.workspace.setSlackWebhook.mutationOptions({
      onSuccess: () => {
        setSlackUrl("");
        if (activeWorkspaceId) {
          qc.invalidateQueries({
            queryKey: trpc.workspace.getById.queryKey({
              workspaceId: activeWorkspaceId,
            }),
          });
        }
      },
    })
  );

  const slackConnected = (workspace as { slackConnected?: boolean } | undefined)
    ?.slackConnected;

  // Account — password change & GitHub linking (BetterAuth client)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwStatus, setPwStatus] = useState<{ ok?: boolean; msg?: string }>({});
  const [githubLoading, setGithubLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwLoading || !currentPassword || newPassword.length < 8) return;
    setPwLoading(true);
    setPwStatus({});
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (res.error) {
        setPwStatus({
          ok: false,
          msg: res.error.message ?? "Failed to update password.",
        });
      } else {
        setPwStatus({ ok: true, msg: "Password updated." });
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (err) {
      setPwStatus({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed to update password.",
      });
    } finally {
      setPwLoading(false);
    }
  }

  async function handleConnectGitHub() {
    setGithubLoading(true);
    try {
      const res = await authClient.linkSocial({
        provider: "github",
        callbackURL: "/settings",
        scopes: ["repo"],
      });
      // The client returns { data: { url, redirect } } but does not navigate
      // automatically (unlike signIn.social) — redirect to GitHub ourselves.
      const url = (res as { data?: { url?: string } })?.data?.url;
      if (url) {
        window.location.href = url;
      } else {
        setGithubLoading(false);
      }
    } catch {
      setGithubLoading(false);
    }
  }

  const updateProfile = useMutation(
    trpc.user.updateProfile.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
      },
    })
  );

  const updateNotificationPrefs = useMutation(
    trpc.user.updateNotificationPrefs.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.user.me.queryKey() });
      },
    })
  );

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || updateProfile.isPending) return;
    updateProfile.mutate({ name: name.trim() });
  }

  function handleToggleNotif(key: string, value: boolean) {
    const next = { ...notifs, [key]: value };
    setNotifs(next);
    updateNotificationPrefs.mutate({ prefs: next });
  }

  async function handleLogout() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
          router.refresh();
        },
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, account, and preferences
        </p>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Tab navigation */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                window.history.replaceState(null, "", `/settings?tab=${tab.id}`);
              }}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* ─── Profile ─── */}
          {activeTab === "profile" && (
            <div className="rounded-xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Profile
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  This information is visible to your workspace members
                </p>
              </div>
              <form onSubmit={handleSaveProfile} className="space-y-5 p-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
                    {getInitials(displayName)}
                  </span>
                  <div>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Change avatar
                    </button>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      JPG, PNG or GIF. Max 2MB.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground">
                    Full name
                  </label>
                  <input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={meLoading || updateProfile.isPending}
                    className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="h-10 w-full max-w-md cursor-not-allowed rounded-lg border border-border bg-secondary px-3.5 text-sm text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your email is used for sign-in and cannot be changed here.
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={meLoading || updateProfile.isPending || !name.trim()}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-notion transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateProfile.isPending ? "Saving..." : "Save changes"}
                  </button>
                  {updateProfile.isSuccess && !updateProfile.isPending && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Saved
                    </span>
                  )}
                  {updateProfile.isError && (
                    <span className="text-sm text-destructive">
                      {updateProfile.error.message}
                    </span>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* ─── Account ─── */}
          {activeTab === "account" && (
            <>
              <div className="rounded-xl border border-border bg-card shadow-notion">
                <div className="border-b border-border px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Password
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Update the password used to sign in to your account
                  </p>
                </div>
                <div className="space-y-5 p-6">
                  <div className="space-y-2">
                    <label htmlFor="current" className="text-sm font-medium text-foreground">
                      Current password
                    </label>
                    <input
                      id="current"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="new" className="text-sm font-medium text-foreground">
                      New password
                    </label>
                    <input
                      id="new"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be at least 8 characters.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleChangePassword}
                      disabled={
                        pwLoading || !currentPassword || newPassword.length < 8
                      }
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-notion transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pwLoading ? "Updating…" : "Update password"}
                    </button>
                    {pwStatus.msg && (
                      <span
                        className={`text-sm ${
                          pwStatus.ok ? "text-emerald-500" : "text-destructive"
                        }`}
                      >
                        {pwStatus.msg}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Connected accounts */}
              <div className="rounded-xl border border-border bg-card shadow-notion">
                <div className="border-b border-border px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-foreground">
                    Connected Accounts
                  </h2>
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">GitHub</p>
                        <p className="text-xs text-muted-foreground">
                          {githubConnected
                            ? "Connected — repository tracking enabled"
                            : githubLinked
                              ? "Linked for sign-in only — reconnect to grant repository access"
                              : "Connect to enable repository tracking"}
                        </p>
                      </div>
                    </div>
                    {githubConnected ? (
                      <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Connected
                      </span>
                    ) : (
                      <button
                        onClick={handleConnectGitHub}
                        disabled={githubLoading}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                      >
                        {githubLoading
                          ? "Redirecting…"
                          : githubLinked
                            ? "Reconnect"
                            : "Connect"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Danger zone */}
              <div className="rounded-xl border border-destructive/30 bg-card shadow-notion">
                <div className="border-b border-destructive/20 px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-destructive">
                    Danger Zone
                  </h2>
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Sign out</p>
                      <p className="text-xs text-muted-foreground">
                        Sign out of your account on this device
                      </p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      Sign out
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Delete account
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete your account and all associated data
                      </p>
                    </div>
                    <button className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20">
                      Delete account
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ─── Notifications ─── */}
          {activeTab === "notifications" && (
            <div className="rounded-xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Notifications
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Choose what you want to be notified about
                </p>
              </div>
              <div className="divide-y divide-border">
                {NOTIFICATION_ITEMS.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 px-6 py-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Toggle
                      enabled={!!notifs[item.key]}
                      onChange={(v) => handleToggleNotif(item.key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Appearance ─── */}
          {activeTab === "appearance" && (
            <div className="rounded-xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Appearance
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Customize how ShipFlow looks for you
                </p>
              </div>
              <div className="p-6">
                <p className="mb-3 text-sm font-medium text-foreground">Theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`rounded-xl border p-4 text-left transition-colors ${
                        theme === t
                          ? "border-primary bg-accent"
                          : "border-border bg-card hover:bg-secondary"
                      }`}
                    >
                      <div
                        className={`mb-3 h-16 w-full rounded-lg border border-border ${
                          t === "light"
                            ? "bg-white"
                            : t === "dark"
                              ? "bg-zinc-900"
                              : "bg-gradient-to-r from-white to-zinc-900"
                        }`}
                      />
                      <span className="text-sm font-medium capitalize text-foreground">
                        {t}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* ─── Integrations ─── */}
          {activeTab === "integrations" && (
            <div className="rounded-xl border border-border bg-card shadow-notion">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Slack
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Send workspace notifications (approvals, AI reviews, shipped
                  features) to a Slack channel
                </p>
              </div>
              <div className="space-y-5 p-6">
                {slackConnected ? (
                  <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                      <p className="text-sm font-medium text-foreground">
                        Connected to Slack
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        activeWorkspaceId &&
                        setSlackWebhook.mutate({
                          workspaceId: activeWorkspaceId,
                          webhookUrl: null,
                        })
                      }
                      disabled={setSlackWebhook.isPending}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                    >
                      {setSlackWebhook.isPending ? "Working…" : "Disconnect"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label
                        htmlFor="slack"
                        className="text-sm font-medium text-foreground"
                      >
                        Slack Incoming Webhook URL
                      </label>
                      <input
                        id="slack"
                        value={slackUrl}
                        onChange={(e) => setSlackUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3.5 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      />
                      <p className="text-xs text-muted-foreground">
                        Create one at api.slack.com → Incoming Webhooks. We send a
                        test message before saving.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          activeWorkspaceId &&
                          slackUrl.trim() &&
                          setSlackWebhook.mutate({
                            workspaceId: activeWorkspaceId,
                            webhookUrl: slackUrl.trim(),
                          })
                        }
                        disabled={
                          setSlackWebhook.isPending ||
                          !slackUrl.trim() ||
                          !activeWorkspaceId
                        }
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-notion transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {setSlackWebhook.isPending ? "Connecting…" : "Connect Slack"}
                      </button>
                      {setSlackWebhook.isError && (
                        <span className="text-sm text-destructive">
                          {setSlackWebhook.error.message}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
