import { serve } from "inngest/next";
import {
  inngest,
  prdGeneration,
  taskGeneration,
  aiReview,
  prProcessing,
  repoAnalysis,
  releaseReadiness,
  notificationDispatch,
  webhookEventPrune,
  weeklyDigest,
} from "@shipflow/inngest";

/**
 * Inngest serve endpoint for ShipFlow AI workflows.
 *
 * Registers all workflow functions with the Inngest client and
 * exposes the serve handler as a Next.js App Router API route.
 *
 * Event routing (no duplicate handlers):
 * - feature/prd.generate  → prdGeneration
 * - prd/tasks.generate    → taskGeneration
 * - review/pr.review      → aiReview
 * - review/completed      → releaseReadiness (runs after aiReview emits it)
 * - webhook/process       → prProcessing (pull_request) + repoAnalysis (push),
 *                           each guards on eventType so only one acts per event
 *
 * Requirements: 10.1
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    prdGeneration,
    taskGeneration,
    aiReview,
    releaseReadiness,
    prProcessing,
    repoAnalysis,
    notificationDispatch,
    webhookEventPrune,
    weeklyDigest,
  ],
});
