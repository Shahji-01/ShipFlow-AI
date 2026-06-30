import { createTRPCRouter, publicProcedure } from "../trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),
});
