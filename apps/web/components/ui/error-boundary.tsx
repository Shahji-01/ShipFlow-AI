"use client";

import React from "react";
import { Button } from "@shipflow/ui";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="rounded-full bg-red-100 p-4 dark:bg-red-900/30">
            <AlertIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
            An unexpected error occurred. Your data has been preserved. Please try
            again or contact support if the problem persists.
          </p>
          {this.state.error && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 font-mono max-w-md truncate">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            <Button onClick={this.handleRetry}>Try Again</Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default ErrorBoundary;
