"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@shipflow/ui";
import { useTheme } from "../../lib/theme-context";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  href?: string;
  action?: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const commands = React.useMemo<CommandItem[]>(
    () => [
      { id: "dashboard", label: "Go to Dashboard", href: "/dashboard", icon: HomeIcon, category: "Navigation", keywords: "home overview" },
      { id: "features", label: "Go to Features", href: "/features", icon: LightbulbIcon, category: "Navigation", keywords: "ideas requests" },
      { id: "prd", label: "Go to PRD", href: "/prd", icon: DocumentIcon, category: "Navigation", keywords: "product requirements document spec" },
      { id: "tasks", label: "Go to Tasks", href: "/tasks", icon: KanbanIcon, category: "Navigation", keywords: "kanban board" },
      { id: "reviews", label: "Go to Reviews", href: "/reviews", icon: CodeReviewIcon, category: "Navigation", keywords: "pull request pr code" },
      { id: "github", label: "Go to GitHub", href: "/github", icon: GitHubIcon, category: "Navigation", keywords: "repository repo" },
      { id: "approvals", label: "Go to Approvals", href: "/approvals", icon: CheckCircleIcon, category: "Navigation", keywords: "ship approve" },
      { id: "analytics", label: "Go to Analytics", href: "/analytics", icon: ChartIcon, category: "Navigation", keywords: "metrics charts insights" },
      { id: "workspace", label: "Go to Workspace", href: "/workspace", icon: UsersIcon, category: "Navigation", keywords: "team members" },
      { id: "billing", label: "Go to Billing", href: "/billing", icon: CreditCardIcon, category: "Navigation", keywords: "plan subscription payment" },
      { id: "settings", label: "Go to Settings", href: "/settings", icon: GearIcon, category: "Navigation", keywords: "preferences profile account" },
      { id: "new-feature", label: "Create New Feature Request", href: "/features/new", icon: PlusIcon, category: "Actions", keywords: "add create idea" },
      { id: "new-workspace", label: "Create New Workspace", href: "/workspace/new", icon: PlusIcon, category: "Actions", keywords: "add team" },
      {
        id: "toggle-theme",
        label: resolvedTheme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        icon: resolvedTheme === "dark" ? SunIcon : MoonIcon,
        category: "Actions",
        keywords: "theme dark light appearance mode",
        action: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ],
    [resolvedTheme, setTheme]
  );

  // Register keyboard shortcut
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened; lock body scroll while open
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [open]);

  const filteredCommands = React.useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.category.toLowerCase().includes(lower) ||
        (cmd.keywords?.toLowerCase().includes(lower) ?? false)
    );
  }, [query, commands]);

  // Reset selected index when filter changes
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Keep the active option scrolled into view during keyboard navigation
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>(
      '[data-active="true"]'
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, open]);

  function handleSelect(command: CommandItem) {
    setOpen(false);
    if (command.action) {
      command.action();
    } else if (command.href) {
      router.push(command.href);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        handleSelect(filteredCommands[selectedIndex]);
      }
    }
  }

  // Group filtered commands by category
  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  if (!open) return null;

  let globalIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Palette — gradient border accent wrapper */}
      <div className="relative w-full max-w-lg rounded-xl bg-gradient-to-b from-primary/30 via-border to-border p-px shadow-2xl animate-slide-in-from-top-2">
        <div
          className="glass relative w-full overflow-hidden rounded-[calc(0.75rem-1px)] bg-popover/95 text-popover-foreground"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          {/* Search Input */}
          <div className="flex items-center border-b border-border px-4">
            <SearchIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 bg-transparent px-3 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Search commands"
            />
            <kbd className="hidden rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2" role="listbox">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {category}
                  </div>
                  {items.map((cmd) => {
                    globalIndex++;
                    const idx = globalIndex;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => handleSelect(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        data-active={idx === selectedIndex}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          idx === selectedIndex
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground"
                        )}
                        role="option"
                        aria-selected={idx === selectedIndex}
                      >
                        <cmd.icon className="h-4 w-4 shrink-0" />
                        <span>{cmd.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-secondary/50 px-1 py-0.5 font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-secondary/50 px-1 py-0.5 font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-secondary/50 px-1 py-0.5 font-mono">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Inline SVG Icons ───────────────────────────────────────── */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="12" rx="1" />
      <rect x="17" y="3" width="5" height="8" rx="1" />
    </svg>
  );
}

function CodeReviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16,18 22,12 16,6" />
      <polyline points="8,6 2,12 8,18" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22,4 12,14.01 9,11.01" />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 9 3.17V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
