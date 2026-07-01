"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  loggerLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import * as React from "react";
import { useState } from "react";
import type { AppRouter } from "@shipflow/api";

/**
 * tRPC React hooks created via @trpc/tanstack-react-query.
 * Provides type-safe hooks for client components.
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * TRPCReactProvider wraps the app with QueryClient and tRPC client.
 * Use this in the root layout for client components that need tRPC.
 */
export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Data is considered fresh for 20 s; after that the next mount /
            // focus / interval will trigger a background refetch.
            staleTime: 20 * 1000,
            // Re-fetch whenever the user focuses the tab so switching away and
            // back always pulls the latest data without a manual refresh.
            refetchOnWindowFocus: true,
            // Retry once on network errors before surfacing them.
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers() {
            return {
              "x-trpc-source": "nextjs-react",
            };
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
