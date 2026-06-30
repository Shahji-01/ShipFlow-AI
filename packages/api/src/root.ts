import { createTRPCRouter, createCallerFactory } from "./trpc";
import { healthRouter } from "./routers/health";
import { workspaceRouter } from "./routers/workspace";
import { featureRequestRouter } from "./routers/featureRequest";
import { prdRouter } from "./routers/prd";
import { taskRouter } from "./routers/task";
import { githubRouter } from "./routers/github";
import { reviewRouter } from "./routers/review";
import { approvalRouter } from "./routers/approval";
import { billingRouter } from "./routers/billing";
import { workflowRouter } from "./routers/workflow";
import { projectRouter } from "./routers/project";
import { activityRouter } from "./routers/activity";
import { notificationRouter } from "./routers/notification";
import { userRouter } from "./routers/user";
import { analyticsRouter } from "./routers/analytics";

/**
 * Root tRPC router for the ShipFlow API.
 * All sub-routers are merged here.
 */
export const appRouter = createTRPCRouter({
  health: healthRouter,
  workspace: workspaceRouter,
  featureRequest: featureRequestRouter,
  prd: prdRouter,
  task: taskRouter,
  github: githubRouter,
  review: reviewRouter,
  approval: approvalRouter,
  billing: billingRouter,
  workflow: workflowRouter,
  project: projectRouter,
  activity: activityRouter,
  notification: notificationRouter,
  user: userRouter,
  analytics: analyticsRouter,
});

/**
 * Export the router type for client-side type inference.
 */
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
