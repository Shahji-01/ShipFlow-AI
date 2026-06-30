import { inngest } from "../client";
import prisma, { WorkflowStatus, WorkflowType, TaskStatus } from "@shipflow/database";
import { z } from "zod";
import { aiGenerateObject } from "../ai";

/**
 * Task Generation Inngest Workflow
 *
 * Steps: parse PRD → decompose user stories → create tasks with acceptance criteria → notify
 * Displays progress with step name and completion percentage.
 *
 * Requirements: 3.1, 3.3, 10.1, 10.2
 */

const tasksSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string().max(120).describe("Task title, max 120 characters"),
      description: z.string().describe("Detailed task description"),
      acceptanceCriteria: z.string().describe("Acceptance criteria for this task"),
    })
  ),
});

interface GeneratedTask {
  title: string;
  description: string;
  acceptanceCriteria: string;
}

interface PRDData {
  prdId: string;
  featureRequestId: string;
  content: Record<string, unknown>;
  featureTitle: string;
}

const TOTAL_STEPS = 4;

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

export const taskGeneration = inngest.createFunction(
  {
    id: "task-generation",
    name: "Task Generation",
    retries: 3,
  },
  { event: "prd/tasks.generate" },
  async ({ event, step }) => {
    const { prdId, workspaceId, userId } = event.data;

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      const prd = await prisma.pRD.findUnique({
        where: { id: prdId },
        select: { featureRequestId: true },
      });

      return await prisma.workflow.create({
        data: {
          featureRequestId: prd?.featureRequestId ?? null,
          type: WorkflowType.TASK_GENERATION,
          status: WorkflowStatus.RUNNING,
          currentStep: "parse-prd",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: userId,
        },
      });
    });

    // Step 1: Parse PRD
    const prdData = await step.run("parse-prd", async (): Promise<PRDData> => {
      await updateWorkflowProgress(workflow.id, "parse-prd", 0, WorkflowStatus.RUNNING);

      const prd = await prisma.pRD.findUnique({
        where: { id: prdId },
        include: {
          featureRequest: {
            select: { id: true, title: true, description: true },
          },
        },
      });

      if (!prd) {
        throw new Error(`PRD ${prdId} not found`);
      }

      return {
        prdId: prd.id,
        featureRequestId: prd.featureRequestId,
        content: prd.content as Record<string, unknown>,
        featureTitle: prd.featureRequest.title,
      };
    });

    // Step 2: Decompose user stories into tasks via AI
    const generatedTasks = await step.run("decompose-user-stories", async (): Promise<GeneratedTask[]> => {
      await updateWorkflowProgress(workflow.id, "decompose-user-stories", 1);

      const data = prdData as PRDData;

      const { object } = await aiGenerateObject({
        schema: tasksSchema,
        system: `You are a senior engineering lead breaking down a PRD into specific, actionable engineering tasks. Each task should be small enough for a single developer to complete in 1-3 days. Tasks should have clear acceptance criteria derived from the PRD.`,
        prompt: `Break down the following PRD into engineering tasks:

Feature: ${data.featureTitle}

PRD Content:
${JSON.stringify(data.content, null, 2)}

Generate tasks that:
- Have titles of max 120 characters
- Have clear, detailed descriptions
- Have specific, testable acceptance criteria
- Cover all user stories and acceptance criteria from the PRD
- Are ordered by implementation priority/dependency`,
      });

      return object.tasks;
    });

    // Step 3: Create tasks in database
    const createdTasks = await step.run("create-tasks", async (): Promise<Array<{ id: string; title: string }>> => {
      await updateWorkflowProgress(workflow.id, "create-tasks", 2);

      const data = prdData as PRDData;
      const tasks = generatedTasks as GeneratedTask[];

      const created = await Promise.all(
        tasks.map((task: GeneratedTask, index: number) =>
          prisma.task.create({
            data: {
              featureRequestId: data.featureRequestId,
              title: task.title.substring(0, 120),
              description: task.description,
              acceptanceCriteria: task.acceptanceCriteria,
              status: TaskStatus.BACKLOG,
              order: index,
            },
          })
        )
      );

      return created.map((t) => ({ id: t.id, title: t.title }));
    });

    // Step 4: Notify and complete
    await step.run("notify-completion", async () => {
      await updateWorkflowProgress(workflow.id, "notify-completion", 3);

      await prisma.workflow.update({
        where: { id: workflow.id },
        data: {
          status: WorkflowStatus.COMPLETED,
          completedSteps: TOTAL_STEPS,
          currentStep: "complete",
          completedAt: new Date(),
        },
      });

      return { notified: true };
    });

    const taskList = createdTasks as Array<{ id: string; title: string }>;

    // Notify the feature creator that tasks are ready (+ activity + Slack).
    const prd = prdData as PRDData;
    await step.sendEvent("notify-tasks-ready", {
      name: "notify/dispatch",
      data: {
        workspaceId,
        featureRequestId: prd.featureRequestId,
        target: { includeFeatureCreator: true },
        type: "tasks_generated",
        title: "Engineering tasks ready",
        body: `${taskList.length} task(s) were generated for "${prd.featureTitle}".`,
        link: "/tasks",
        activity: {
          type: "tasks.generated",
          message: `${taskList.length} tasks generated for "${prd.featureTitle}"`,
          entityType: "feature",
          entityId: prd.featureRequestId,
        },
      },
    });

    return {
      status: "completed",
      workflowId: workflow.id,
      tasksCreated: taskList.length,
      tasks: taskList,
    };
  }
);
