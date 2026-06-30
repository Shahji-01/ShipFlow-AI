import { inngest } from "../client";
import prisma, { WorkflowStatus, WorkflowType, FeaturePhase } from "@shipflow/database";
import { z } from "zod";
import { aiGenerateObject } from "../ai";

/**
 * PRD Generation Inngest Workflow
 *
 * Steps: analyze feature request → check clarification complete → generate PRD via AI SDK → validate all sections present → save to database
 * Updates workflow status at each step.
 * On failure: returns feature to clarification state (DISCOVERY).
 *
 * Requirements: 2.1, 2.2, 2.5, 10.1, 10.2
 */

const prdSchema = z.object({
  problemStatement: z.string().describe("Clear description of the problem being solved"),
  goals: z.array(z.string()).describe("List of goals for this feature"),
  nonGoals: z.array(z.string()).describe("List of non-goals / out of scope items"),
  userStories: z.array(z.string()).describe("User stories in standard format"),
  acceptanceCriteria: z.array(z.string()).describe("Measurable acceptance criteria"),
  edgeCases: z.array(z.string()).describe("Edge cases to consider"),
  successMetrics: z.array(z.string()).describe("Metrics to measure success"),
});

type PRDContent = z.infer<typeof prdSchema>;

interface FeatureRequestData {
  id: string;
  title: string;
  description: string;
  phase: string;
  clarifications: Array<{ question: string; answer: string | null; skipped: boolean }>;
}

const TOTAL_STEPS = 5;

async function updateWorkflowProgress(
  workflowId: string,
  stepName: string,
  completedSteps: number,
  status?: WorkflowStatus
) {
  await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      currentStep: stepName,
      completedSteps,
      ...(status ? { status } : {}),
      updatedAt: new Date(),
    },
  });
}

export const prdGeneration = inngest.createFunction(
  {
    id: "prd-generation",
    name: "PRD Generation",
    retries: 3,
  },
  { event: "feature/prd.generate" },
  async ({ event, step }) => {
    const { featureRequestId, workspaceId, userId } = event.data;

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      return await prisma.workflow.create({
        data: {
          featureRequestId,
          type: WorkflowType.PRD_GENERATION,
          status: WorkflowStatus.RUNNING,
          currentStep: "analyze-feature-request",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: userId,
        },
      });
    });

    // Step 1: Analyze feature request
    const featureRequest = await step.run("analyze-feature-request", async (): Promise<FeatureRequestData> => {
      await updateWorkflowProgress(workflow.id, "analyze-feature-request", 0, WorkflowStatus.RUNNING);

      const fr = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
        include: {
          clarifications: true,
        },
      });

      if (!fr) {
        throw new Error(`Feature request ${featureRequestId} not found`);
      }

      return {
        id: fr.id,
        title: fr.title,
        description: fr.description,
        phase: fr.phase,
        clarifications: fr.clarifications.map((c) => ({
          question: c.question,
          answer: c.answer,
          skipped: c.skipped,
        })),
      };
    });

    // Step 2: Check clarification complete
    await step.run("check-clarification-complete", async () => {
      await updateWorkflowProgress(workflow.id, "check-clarification-complete", 1);

      const unanswered = (featureRequest as FeatureRequestData).clarifications.filter(
        (c) => !c.answer && !c.skipped
      );
      if (unanswered.length > 0) {
        // Return to DISCOVERY state if clarification incomplete
        await prisma.featureRequest.update({
          where: { id: featureRequestId },
          data: { phase: FeaturePhase.DISCOVERY },
        });

        await prisma.workflow.update({
          where: { id: workflow.id },
          data: {
            status: WorkflowStatus.FAILED,
            errorMessage: "Clarification not complete - unanswered questions remain",
            completedAt: new Date(),
          },
        });

        throw new Error("Clarification not complete - unanswered questions remain");
      }

      return { clarificationComplete: true };
    });

    // Step 3: Generate PRD via AI SDK
    const prdContent = await step.run("generate-prd", async (): Promise<PRDContent> => {
      await updateWorkflowProgress(workflow.id, "generate-prd", 2);

      const fr = featureRequest as FeatureRequestData;
      const clarificationContext = fr.clarifications
        .filter((c) => c.answer)
        .map((c) => `Q: ${c.question}\nA: ${c.answer}`)
        .join("\n\n");

      const { object } = await aiGenerateObject({
        schema: prdSchema,
        system: `You are a senior product manager creating a comprehensive Product Requirements Document (PRD). Generate a thorough, well-structured PRD from the feature request and any clarification responses provided.`,
        prompt: `Generate a PRD for the following feature request:

Title: ${fr.title}
Description: ${fr.description}

${clarificationContext ? `Additional clarification:\n${clarificationContext}` : ""}

Generate all required sections: problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, and success metrics. Each section must be non-empty and substantive.`,
      });

      return object;
    });

    // Step 4: Validate all sections present
    await step.run("validate-prd-sections", async () => {
      await updateWorkflowProgress(workflow.id, "validate-prd-sections", 3);

      const content = prdContent as PRDContent;
      const requiredSections: (keyof PRDContent)[] = [
        "problemStatement",
        "goals",
        "nonGoals",
        "userStories",
        "acceptanceCriteria",
        "edgeCases",
        "successMetrics",
      ];

      const missingSections = requiredSections.filter((section) => {
        const value = content[section];
        if (typeof value === "string") return !value.trim();
        if (Array.isArray(value)) return value.length === 0;
        return !value;
      });

      if (missingSections.length > 0) {
        await prisma.featureRequest.update({
          where: { id: featureRequestId },
          data: { phase: FeaturePhase.DISCOVERY },
        });

        await prisma.workflow.update({
          where: { id: workflow.id },
          data: {
            status: WorkflowStatus.FAILED,
            errorMessage: `PRD generation incomplete - missing sections: ${missingSections.join(", ")}`,
            completedAt: new Date(),
          },
        });

        throw new Error(`PRD generation incomplete - missing sections: ${missingSections.join(", ")}`);
      }

      return { valid: true };
    });

    // Step 5: Save to database
    const savedPrd = await step.run("save-prd", async () => {
      await updateWorkflowProgress(workflow.id, "save-prd", 4);

      const prd = await prisma.pRD.upsert({
        where: { featureRequestId },
        create: {
          featureRequestId,
          content: JSON.parse(JSON.stringify(prdContent)),
          status: "DRAFT",
        },
        update: {
          content: JSON.parse(JSON.stringify(prdContent)),
          status: "DRAFT",
          updatedAt: new Date(),
        },
      });

      // Transition feature to PLANNING phase
      await prisma.featureRequest.update({
        where: { id: featureRequestId },
        data: { phase: FeaturePhase.PLANNING },
      });

      // Mark workflow complete
      await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: WorkflowStatus.COMPLETED,
          completedSteps: TOTAL_STEPS,
          currentStep: "complete",
          completedAt: new Date(),
        },
      });

      return { prdId: prd.id };
    });

    // Notify the feature creator that the PRD is ready, record activity,
    // and fan out to Slack — all via the central dispatcher.
    await step.sendEvent("notify-prd-ready", {
      name: "notify/dispatch",
      data: {
        workspaceId,
        featureRequestId,
        target: { includeFeatureCreator: true },
        type: "prd_generated",
        title: "PRD ready for review",
        body: `The PRD for "${(featureRequest as FeatureRequestData).title}" has been generated and is ready to review.`,
        link: `/prd/${(savedPrd as { prdId: string }).prdId}`,
        activity: {
          type: "prd.generated",
          message: `PRD generated for "${(featureRequest as FeatureRequestData).title}"`,
          entityType: "prd",
          entityId: (savedPrd as { prdId: string }).prdId,
        },
      },
    });

    return {
      status: "completed",
      workflowId: workflow.id,
      prdId: (savedPrd as { prdId: string }).prdId,
    };
  }
);
