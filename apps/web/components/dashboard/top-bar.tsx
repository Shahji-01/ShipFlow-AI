"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@shipflow/ui";
import { useTRPC } from "../../lib/trpc-react";
import { useTheme } from "../../lib/theme-context";

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function TopBar({ onToggleSidebar, sidebarCollapsed }: TopBarProps) {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border px-4">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            {index > 0 && (
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground/60" />
            )}
            {index === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command palette trigger */}
      <button
        onClick={() => {
          // Dispatch keyboard event to open command palette
          const event = new KeyboardEvent("keydown", {
            key: "k",
            metaKey: true,
            bubbles: true,
          });
          document.dispatchEvent(event);
        }}
        className="hidden items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-sm text-muted-foreground transition-all duration-200 hover:border-border hover:bg-secondary hover:text-foreground sm:flex"
        aria-label="Open command palette"
      >
        <SearchIcon className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-2 rounded border border-border bg-background/60 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Notifications */}
      <NotificationsBell />
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

function NotificationsBell() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const { data: unreadCount = 0 } = useQuery(
    trpc.notification.unreadCount.queryOptions()
  );

  const { data: list, isLoading } = useQuery(
    trpc.notification.list.queryOptions(
      { limit: 10 },
      { enabled: open }
    )
  );

  const markAllRead = useMutation(
    trpc.notification.markAllRead.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.notification.list.queryKey() });
        qc.invalidateQueries({
          queryKey: trpc.notification.unreadCount.queryKey(),
        });
      },
    })
  );

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

  const items = list?.items ?? [];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl animate-slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              Notifications
            </span>
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending || unreadCount === 0}
              className="text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:text-muted-foreground/50"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0",
                    !n.read && "bg-secondary/40"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-primary"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date | string): string {
  const then = new Date(date).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(date).toLocaleDateString();
}

function generateBreadcrumbs(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const breadcrumbs: { label: string; href: string }[] = [];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    breadcrumbs.push({
      label: formatSegment(segment),
      href: currentPath,
    });
  }

  return breadcrumbs.length === 0
    ? [{ label: "Dashboard", href: "/dashboard" }]
    : breadcrumbs;
}

function formatSegment(segment: string): string {
  // Capitalize and replace hyphens with spaces
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ─── Inline SVG Icons ───────────────────────────────────────── */

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,6 15,12 9,18" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
