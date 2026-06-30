"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@shipflow/ui";
import { signIn } from "@shipflow/auth/client";

const inputClasses =
  "h-11 rounded-lg border-border bg-background px-4 transition-all duration-200 placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn.email({ email, password });
      if ("error" in result && result.error) {
        setError("Invalid credentials. Please try again.");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    setIsGitHubLoading(true);
    try {
      await signIn.social({ provider: "github", callbackURL: "/dashboard" });
    } catch {
      setError("Failed to sign in with GitHub. Please try again.");
      setIsGitHubLoading(false);
    }
  };

  return (
    <Card className="rounded-xl border border-border bg-card shadow-notion-lg">
      <CardHeader className="space-y-2 pb-2">
        <CardTitle className="font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Sign in to access your workspace
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive animate-slide-up"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={isLoading}
              className={inputClasses}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-notion transition-colors duration-200 hover:bg-primary/90"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </Button>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wider">
              <span className="bg-card px-3 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGitHubSignIn}
            disabled={isGitHubLoading}
            className="h-11 w-full rounded-lg border-border bg-card text-base font-medium text-foreground transition-colors duration-200 hover:bg-secondary"
          >
            {isGitHubLoading ? (
              <span className="flex items-center gap-2">
                <Spinner />
                Connecting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </span>
            )}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="flex justify-center pt-2">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-primary transition-colors hover:text-primary/80"
          >
            Create account
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
