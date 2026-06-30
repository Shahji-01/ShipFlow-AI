import { inngest } from "../client";
import prisma, { WorkflowStatus, WorkflowType } from "@shipflow/database";
import { Octokit } from "octokit";
import { decryptSecret } from "../crypto";

/**
 * Repository Analysis Inngest Workflow
 *
 * Steps: clone-metadata → analyze-structure → index
 * Analyzes connected repository structure and indexes metadata.
 *
 * Requirements: 4.2, 4.3, 10.1
 */

const TOTAL_STEPS = 3;

interface RepoMetadata {
  id: string;
  fullName: string;
  defaultBranch: string;
  accessToken: string | null;
}

interface RepoAnalysis {
  languages: string[];
  fileCount: number;
  branches: string[];
}

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

export const repoAnalysis = inngest.createFunction(
  {
    id: "repo-analysis",
    name: "Repository Analysis",
    retries: 3,
  },
  { event: "webhook/process" },
  async ({ event, step }) => {
    const { repositoryId, eventType } = event.data;

    // Only handle push events for repo analysis
    if (eventType !== "push") {
      return { status: "skipped", reason: "Not a push event" };
    }

    // Create workflow record
    const workflow = await step.run("create-workflow", async () => {
      return await prisma.workflow.create({
        data: {
          type: WorkflowType.REPO_ANALYSIS,
          status: WorkflowStatus.RUNNING,
          currentStep: "clone-metadata",
          totalSteps: TOTAL_STEPS,
          completedSteps: 0,
          startedAt: new Date(),
          initiatedById: "system",
        },
      });
    });

    // Step 1: Clone metadata (fetch repository info)
    const repoMetadata = await step.run("clone-metadata", async (): Promise<RepoMetadata> => {
      await updateWorkflowProgress(workflow.id, "clone-metadata", 0, WorkflowStatus.RUNNING);

      const repository = await prisma.repository.findUnique({
        where: { id: repositoryId },
        include: {
          project: {
            include: {
              workspace: {
                include: {
                  members: {
                    take: 1,
                    include: {
                      user: {
                        include: {
                          accounts: {
                            where: { provider: "github" },
                            select: { accessToken: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!repository) {
        throw new Error(`Repository ${repositoryId} not found`);
      }

      // Get an access token from workspace members
      let accessToken: string | null = null;
      for (const member of repository.project.workspace.members) {
        const ghAccount = member.user.accounts[0];
        if (ghAccount?.accessToken) {
          accessToken = decryptSecret(ghAccount.accessToken);
          break;
        }
      }

      return {
        id: repository.id,
        fullName: repository.fullName,
        defaultBranch: repository.defaultBranch,
        accessToken,
      };
    });

    // Step 2: Analyze structure
    const analysis = await step.run("analyze-structure", async (): Promise<RepoAnalysis> => {
      await updateWorkflowProgress(workflow.id, "analyze-structure", 1);

      const metadata = repoMetadata as RepoMetadata;

      if (!metadata.accessToken) {
        return { languages: [], fileCount: 0, branches: [] };
      }

      const octokit = new Octokit({ auth: metadata.accessToken });
      const [owner, repo] = metadata.fullName.split("/");

      if (!owner || !repo) {
        return { languages: [], fileCount: 0, branches: [] };
      }

      // Fetch repository languages
      const languagesResponse = await octokit.rest.repos.listLanguages({
        owner,
        repo,
      });

      // Fetch branches
      const branchesResponse = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 30,
      });

      const languageBytes = Object.values(languagesResponse.data) as number[];

      return {
        languages: Object.keys(languagesResponse.data),
        fileCount: languageBytes.reduce((a: number, b: number) => a + b, 0),
        branches: branchesResponse.data.map((b: { name: string }) => b.name),
      };
    });

    // Step 3: Index (update repository metadata in database)
    await step.run("index", async () => {
      await updateWorkflowProgress(workflow.id, "index", 2);

      const metadata = repoMetadata as RepoMetadata;

      // Store analysis metadata on the repository
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          defaultBranch: metadata.defaultBranch,
        },
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

      return { indexed: true };
    });

    return {
      status: "completed",
      workflowId: workflow.id,
      repositoryId,
      analysis: analysis as RepoAnalysis,
    };
  }
);
