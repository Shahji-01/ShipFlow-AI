import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@shipflow/api";

/**
 * tRPC HTTP handler for Next.js App Router.
 * Handles all tRPC API calls via the fetch adapter.
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ req }) => createContext({ headers: req.headers }),
  });

export { handler as GET, handler as POST };
