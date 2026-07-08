import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { type PrismaClient } from "@shipflow/database";
import { createTRPCRouter, workspaceProcedure } from "../trpc";
import {
  createOctokit,
  createWebhook,
  deleteWebhook,
  fetchDiff,
  listUserRepos,
  listRepoPullRequests,
  generateWebhookSecret,
} from "../services/github";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { recordActivity } from "../services/activity";
import { checkUsageLimit, USAGE_TYPES } from "../services/billing";
import { logger } from "../lib/logger";

/**
 * Helper to verify a project belongs to the given workspace.
 */
async function verifyProjectInWorkspace(
  db: PrismaClient,
  projectId: string,
  workspaceId: string
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });

  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found.",
    });
  }

  if (project.workspaceId !== workspaceId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found in this workspace.",
    });
  }

  return project;
}

/**
 * Resolve the current user's GitHub access token from their linked OAuth
 * account. The token is stored encrypted at rest, so we decrypt it here.
 * Clients never handle the raw token. Throws if GitHub isn't connected or the
 * connection lacks the `repo` scope required for repository operations.
 */
async function getUserGitHubToken(
  db: PrismaClient,
  userId: string
): Promise<string> {
  const account = await db.account.findFirst({
    where: { userId, provider: "github" },
    select: { accessToken: true, scope: true },
  });

  if (!account?.accessToken) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "GitHub is not connected. Connect GitHub in Settings to continue.",
    });
  }

  const scopes =
    account.scope?.split(",").map((s) => s.trim().toLowerCase()) ?? [];
  if (!scopes.includes("repo")) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Your GitHub connection lacks repository access. Reconnect GitHub in Settings to grant the 'repo' scope.",
    });
  }

  return decryptSecret(account.accessToken);
}

/** Derive the webhook callback URL from configured app URL. */
function defaultWebhookUrl(): string {
  const base =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
    "";
  return base ? `${base.replace(/\/$/, "")}/api/webhooks/github` : "";
}

/**
 * GitHub integration tRPC router.
 * Handles repository connection, webhook management, and PR operations.
 */
export const githubRouter = createTRPCRouter({
  /**
   * Connect a GitHub repository to a project.
   * Authenticates via OAuth token, registers webhooks, and stores the repository record.
   * Requirements: 4.1, 4.6
   */
  connectRepo: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string(),
        repoFullName: z.string().min(1, "Repository full name is required"),
        // Optional overrides; resolved server-side from the linked account / env
        // when omitted (the normal case from the UI).
        githubToken: z.string().optional(),
        webhookUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(ctx.db, input.projectId, input.workspaceId);

      const githubToken =
        input.githubToken ??
        (await getUserGitHubToken(ctx.db, ctx.session.user.id));
      const webhookUrl = input.webhookUrl ?? defaultWebhookUrl();

      // Enforce the workspace's repository limit for its billing tier.
      const repoUsage = await checkUsageLimit(
        ctx.db,
        input.workspaceId,
        USAGE_TYPES.REPO_CONNECTION
      );
      if (!repoUsage.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            repoUsage.message ??
            "Repository connection limit reached for this plan.",
        });
      }

      const [owner, repo] = input.repoFullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Repository full name must be in 'owner/repo' format.",
        });
      }

      const octokit = createOctokit(githubToken);

      // Fetch repository details from GitHub
      let repoData;
      try {
        const response = await octokit.rest.repos.get({ owner, repo });
        repoData = response.data;
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "GitHub repository not found or access denied.",
        });
      }

      // Check if the repository is already connected
      const existing = await ctx.db.repository.findUnique({
        where: { githubId: BigInt(repoData.id) },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This repository is already connected to a project.",
        });
      }

      // Generate a webhook secret and register the webhook (best-effort).
      const webhookSecret = generateWebhookSecret();
      let webhookId: bigint | null = null;

      if (webhookUrl) {
        try {
          const result = await createWebhook(
            octokit,
            owner,
            repo,
            webhookUrl,
            webhookSecret
          );
          webhookId = BigInt(result.webhookId);
        } catch (err) {
          // Webhook creation may fail if user lacks admin access (or the URL is
          // not reachable, e.g. localhost). Store the repo without webhook -
          // it can be retried later.
          logger.warn("Failed to create GitHub webhook", {
            repo: input.repoFullName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Store the repository record. Webhook secret is encrypted at rest.
      const repository = await ctx.db.repository.create({
        data: {
          projectId: input.projectId,
          githubId: BigInt(repoData.id),
          fullName: repoData.full_name,
          defaultBranch: repoData.default_branch,
          webhookId,
          webhookSecret: encryptSecret(webhookSecret),
        },
      });

      await recordActivity(ctx.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.session.user.id,
        type: "repository.connected",
        message: `Connected repository "${repoData.full_name}"`,
        entityType: "repository",
        entityId: repository.id,
      });

      return repository;
    }),

  /**
   * List repositories connected to a project.
   */
  listRepos: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await verifyProjectInWorkspace(ctx.db, input.projectId, input.workspaceId);

      const repositories = await ctx.db.repository.findMany({
        where: { projectId: input.projectId },
        orderBy: { connectedAt: "desc" },
      });

      return repositories;
    }),

  /**
   * Disconnect a GitHub repository from a project.
   * Deletes the webhook from GitHub and removes the repository record.
   */
  disconnectRepo: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryId: z.string(),
        githubToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId },
        include: {
          project: { select: { workspaceId: true } },
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found.",
        });
      }

      if (repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found in this workspace.",
        });
      }

      // Try to delete the webhook from GitHub
      if (repository.webhookId) {
        const [owner, repo] = repository.fullName.split("/");
        if (owner && repo) {
          try {
            const githubToken =
              input.githubToken ??
              (await getUserGitHubToken(ctx.db, ctx.session.user.id));
            const octokit = createOctokit(githubToken);
            await deleteWebhook(octokit, owner, repo, Number(repository.webhookId));
          } catch {
            // Non-critical: webhook may already be deleted, user lacks
            // permissions, or GitHub is no longer connected.
            logger.warn("Failed to delete webhook from GitHub", {
              repositoryId: input.repositoryId,
            });
          }
        }
      }

      // Delete the repository record (cascades to pull requests)
      await ctx.db.repository.delete({
        where: { id: input.repositoryId },
      });

      await recordActivity(ctx.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.session.user.id,
        type: "repository.disconnected",
        message: `Disconnected repository "${repository.fullName}"`,
        entityType: "repository",
        entityId: repository.id,
      });

      return { success: true };
    }),

  /**
   * List pull requests for a connected repository.
   * Fetches from the local database (stored from webhook events).
   */
  listPRs: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryId: z.string(),
        status: z.enum(["OPEN", "CLOSED", "MERGED"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId },
        include: {
          project: { select: { workspaceId: true } },
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found.",
        });
      }

      if (repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found in this workspace.",
        });
      }

      const where: Record<string, unknown> = {
        repositoryId: input.repositoryId,
      };

      if (input.status) {
        where.status = input.status;
      }

      const pullRequests = await ctx.db.pullRequest.findMany({
        where,
        include: {
          task: { select: { id: true, title: true, status: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      return pullRequests;
    }),

  /**
   * Get detailed information about a specific pull request.
   * Includes diff summary, linked task, and review data.
   */
  getPRDetails: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        pullRequestId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const pullRequest = await ctx.db.pullRequest.findUnique({
        where: { id: input.pullRequestId },
        include: {
          repository: {
            include: {
              project: { select: { workspaceId: true } },
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              description: true,
              acceptanceCriteria: true,
            },
          },
          reviews: {
            include: {
              issues: true,
            },
            orderBy: { iteration: "desc" },
          },
        },
      });

      if (!pullRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found.",
        });
      }

      if (pullRequest.repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pull request not found in this workspace.",
        });
      }

      return pullRequest;
    }),

  /**
   * List available GitHub repositories for the authenticated user.
   * Used in the connect flow to let users pick a repo.
   */
  listAvailableRepos: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        githubToken: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const githubToken =
        input.githubToken ??
        (await getUserGitHubToken(ctx.db, ctx.session.user.id));
      const octokit = createOctokit(githubToken);
      const repos = await listUserRepos(octokit);
      return repos;
    }),

  /**
   * Sync pull requests from GitHub for a connected repository.
   * Fetches latest PRs and updates local data.
   */
  syncPRs: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        repositoryId: z.string(),
        githubToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const repository = await ctx.db.repository.findUnique({
        where: { id: input.repositoryId },
        include: {
          project: { select: { workspaceId: true } },
        },
      });

      if (!repository) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found.",
        });
      }

      if (repository.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found in this workspace.",
        });
      }

      const [owner, repo] = repository.fullName.split("/");
      if (!owner || !repo) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Invalid repository full name format.",
        });
      }

      const githubToken =
        input.githubToken ??
        (await getUserGitHubToken(ctx.db, ctx.session.user.id));
      const octokit = createOctokit(githubToken);
      const githubPRs = await listRepoPullRequests(octokit, owner, repo, "all");

      let synced = 0;

      for (const pr of githubPRs) {
        // Determine status
        let status: "OPEN" | "CLOSED" | "MERGED" = "OPEN";
        if (pr.merged_at) {
          status = "MERGED";
        } else if (pr.state === "closed") {
          status = "CLOSED";
        }

        // Fetch diff summary for this PR
        let diffSummary = null;
        try {
          diffSummary = await fetchDiff(octokit, owner, repo, pr.number);
        } catch {
          // Non-critical: diff fetching can fail for large PRs
        }

        // Fetch all possible tasks for this repository to do flexible matching in memory
        const possibleTasks = await ctx.db.task.findMany({
          where: {
            featureRequest: {
              project: {
                repositories: {
                  some: { id: input.repositoryId },
                },
              },
            },
          },
          select: { id: true, linkedBranch: true },
        });

        const matchedTask = possibleTasks.find(
          (t) =>
            t.linkedBranch === pr.head.ref ||
            pr.head.ref.includes(t.id)
        );

        if (matchedTask && matchedTask.linkedBranch !== pr.head.ref) {
          // Auto-link by updating the task's linkedBranch
          await ctx.db.task.update({
            where: { id: matchedTask.id },
            data: { linkedBranch: pr.head.ref },
          });
        }

        // Upsert the pull request record
        await ctx.db.pullRequest.upsert({
          where: {
            repositoryId_githubPrId: {
              repositoryId: input.repositoryId,
              githubPrId: BigInt(pr.id),
            },
          },
          create: {
            repositoryId: input.repositoryId,
            taskId: matchedTask?.id ?? null,
            githubPrId: BigInt(pr.id),
            number: pr.number,
            title: pr.title ?? "",
            branchName: pr.head.ref,
            status,
            diffSummary: diffSummary ?? undefined,
          },
          update: {
            title: pr.title ?? "",
            status,
            diffSummary: diffSummary ?? undefined,
            ...(matchedTask?.id ? { task: { connect: { id: matchedTask.id } } } : {}),
          },
        });

        synced++;
      }

      return { synced };
    }),
});
