"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shipflow/ui";
import { useSession } from "@shipflow/auth/client";

interface InviteInfo {
  workspaceName: string;
  inviterName: string;
  role: string;
  expiresAt: string;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? "h-4 w-4"}`}
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
  );
}

const cardClasses =
  "rounded-xl border border-border bg-card shadow-notion-lg";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const token = params.token as string;

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchInviteInfo() {
      try {
        const res = await fetch(`/api/invites/${token}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("This invitation is invalid or has expired.");
          } else {
            setError("Failed to load invitation details.");
          }
          return;
        }
        const data = await res.json();
        setInviteInfo(data);
      } catch {
        setError("Failed to load invitation details.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchInviteInfo();
  }, [token]);

  const handleAccept = async () => {
    if (!session) {
      router.push(`/login?redirect=/invite/${token}`);
      return;
    }

    setIsAccepting(true);
    setError("");

    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Failed to accept invitation.");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Failed to accept invitation. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={cardClasses}>
        <CardContent className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-8 w-8 text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading invitation...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !inviteInfo) {
    return (
      <Card className={cardClasses}>
        <CardContent className="py-14">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/20 bg-destructive/10">
              <svg
                className="h-7 w-7 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground">
                Invalid Invitation
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push("/login")}
              className="h-11 rounded-lg border-border bg-card text-foreground transition-colors duration-200 hover:bg-secondary"
            >
              Go to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClasses}>
      <CardHeader className="space-y-2 text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary shadow-notion">
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        <CardTitle className="font-display text-2xl font-bold tracking-tight text-foreground">
          Workspace Invitation
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          You&apos;ve been invited to join a workspace
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
        {inviteInfo && (
          <div className="rounded-lg border border-border bg-secondary p-5">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Workspace</span>
                <span className="font-medium text-foreground">
                  {inviteInfo.workspaceName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invited by</span>
                <span className="font-medium text-foreground">
                  {inviteInfo.inviterName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Role</span>
                <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-primary">
                  {inviteInfo.role}
                </span>
              </div>
            </div>
          </div>
        )}
        <Button
          onClick={handleAccept}
          disabled={isAccepting}
          className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-notion transition-colors duration-200 hover:bg-primary/90"
        >
          {isAccepting ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Accepting...
            </span>
          ) : (
            "Accept Invitation"
          )}
        </Button>
        {!session && (
          <p className="text-center text-xs text-muted-foreground">
            You&apos;ll be asked to sign in before joining the workspace.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
