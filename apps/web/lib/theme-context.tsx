"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "shipflow-theme";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<"light" | "dark">(
    "dark"
  );

  // Hydrate from storage on mount.
  React.useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem(STORAGE_KEY) as Theme | null)
        : null;
    const initial = stored ?? "dark";
    setThemeState(initial);
  }, []);

  // Resolve + apply whenever theme changes, and react to system changes.
  React.useEffect(() => {
    const resolve = () => {
      const resolved = theme === "system" ? getSystemTheme() : theme;
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    resolve();

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", resolve);
      return () => mq.removeEventListener("change", resolve);
    }
  }, [theme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value: ThemeContextValue = { theme, resolvedTheme, setTheme };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
