import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ApprovalStatus,
  FeaturePhase,
  type WorkspaceRole,
} from "@shipflow/database";
import {
  createTRPCRouter,
  workspaceProcedure,
} from "../trpc";
import { Permission, hasPermission } from "@shipflow/auth/server";
import { transitionFeature } from "../lib/state-machine";
import { inngest } from "@shipflow/inngest";

/**
 * Approval tRPC router.
 * Manages the human approval gate before features are shipped.
 * Requires APPROVE_RELEASE permission for approve/reject actions.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export const approvalRouter = createTRPCRouter({
  /**
   * Get the approval queue - features awaiting human approval.
   * Presents PRD, tasks, PR details, AI review history, and non-blocking issues.
   *
   * Requirement: 6.2
   */
  getApprovalQueue: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Find all features in HUMAN_APPROVAL phase for this workspace
      const features = await ctx.db.featureRequest.findMany({
        where: {
          phase: FeaturePhase.HUMAN_APPROVAL,
          project: {
            workspaceId: input.workspaceId,
          },
        },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
        orderBy: { updatedAt: "desc" },
        include: {
          project: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          prd: true,
          tasks: {
            orderBy: { order: "asc" },
            include: {
              pullRequests: {
                include: {
                  reviews: {
                    include: {
                      issues: true,
                    },
                    orderBy: { iteration: "asc" },
                  },
                },
              },
            },
          },
          approvals: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      let nextCursor: string | undefined;
      if (features.length > input.limit) {
        const nextItem = features.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: features.map((feature) => ({
          id: feature.id,
          title: feature.title,
          description: feature.description,
          phase: feature.phase,
          project: feature.project,
          createdBy: feature.createdBy,
          createdAt: feature.createdAt,
          updatedAt: feature.updatedAt,
          prd: feature.prd,
          tasks: feature.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            acceptanceCriteria: task.acceptanceCriteria,
            status: task.status,
            pullRequests: task.pullRequests.map((pr) => ({
              id: pr.id,
              number: pr.number,
              title: pr.title,
              branchName: pr.branchName,
              status: pr.status,
              reviews: pr.reviews.map((review) => ({
                id: review.id,
                iteration: review.iteration,
                status: review.status,
                completedAt: review.completedAt,
                issues: review.issues.map((issue) => ({
                  id: issue.id,
                  category: issue.category,
                  filePath: issue.filePath,
                  lineNumber: issue.lineNumber,
                  title: issue.title,
                  description: issue.description,
                  resolved: issue.resolved,
                })),
              })),
            })),
          })),
          currentApproval: feature.approvals[0] ?? null,
        })),
        nextCursor,
      };
    }),

  /**
   * Approve a feature for release.
   * Transitions feature to SHIPPED, records approver identity and timestamp.
   * Requires APPROVE_RELEASE permission.
   *
   * Requirements: 6.3, 6.5
   */
  approve: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check that the user has APPROVE_RELEASE permission (Requirement 6.5)
      if (
        !hasPermission(
          ctx.membership.role as WorkspaceRole,
          Permission.APPROVE_RELEASE
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You do not have permission to approve releases. Only users with the Approver role can approve.",
        });
      }

      // Find the feature request and verify it's in HUMAN_APPROVAL phase
      const feature = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          project: {
            select: { workspaceId: true },
          },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      if (feature.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      if (feature.phase !== FeaturePhase.HUMAN_APPROVAL) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Feature must be in HUMAN_APPROVAL phase to be approved.",
        });
      }

      // Validate the transition (HUMAN_APPROVAL → SHIPPED)
      const newPhase = transitionFeature(
        FeaturePhase.HUMAN_APPROVAL,
        FeaturePhase.SHIPPED
      );

      // Update feature phase and create approval record in a transaction
      const [approval] = await ctx.db.$transaction([
        ctx.db.approval.create({
          data: {
            featureRequestId: input.featureRequestId,
            reviewerId: ctx.session.user.id,
            status: ApprovalStatus.APPROVED,
            decidedAt: new Date(),
          },
        }),
        ctx.db.featureRequest.update({
          where: { id: input.featureRequestId },
          data: { phase: newPhase },
        }),
      ]);

      // Notify the team that the feature shipped (+ activity + Slack).
      await inngest.send({
        name: "notify/dispatch",
        data: {
          workspaceId: input.workspaceId,
          featureRequestId: input.featureRequestId,
          target: { includeFeatureCreator: true, roles: ["ADMIN"] },
          type: "feature_shipped",
          title: "Feature shipped 🚀",
          body: `"${feature.title}" was approved and shipped.`,
          link: `/features/${feature.id}`,
          prefKey: "featureShipped",
          activity: {
            actorId: ctx.session.user.id,
            type: "feature.shipped",
            message: `Approved and shipped "${feature.title}"`,
            entityType: "feature",
            entityId: feature.id,
          },
        },
      });

      return {
        approvalId: approval.id,
        status: ApprovalStatus.APPROVED,
        featurePhase: newPhase,
        approvedBy: ctx.session.user.id,
        approvedAt: approval.decidedAt,
        message: "Feature approved and transitioned to SHIPPED.",
      };
    }),

  /**
   * Reject a feature release.
   * Requires at least 1 character of comment text.
   * Transitions feature back to FIX_NEEDED with reviewer comments attached.
   * Requires APPROVE_RELEASE permission.
   *
   * Requirements: 6.4, 6.5
   */
  reject: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        comment: z
          .string()
          .min(1, "A comment is required when rejecting a release."),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check that the user has APPROVE_RELEASE permission (Requirement 6.5)
      if (
        !hasPermission(
          ctx.membership.role as WorkspaceRole,
          Permission.APPROVE_RELEASE
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You do not have permission to reject releases. Only users with the Approver role can reject.",
        });
      }

      // Find the feature request and verify it's in HUMAN_APPROVAL phase
      const feature = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          project: {
            select: { workspaceId: true },
          },
        },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      if (feature.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found in this workspace.",
        });
      }

      if (feature.phase !== FeaturePhase.HUMAN_APPROVAL) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Feature must be in HUMAN_APPROVAL phase to be rejected.",
        });
      }

      // Validate the transition (HUMAN_APPROVAL → FIX_NEEDED)
      const newPhase = transitionFeature(
        FeaturePhase.HUMAN_APPROVAL,
        FeaturePhase.FIX_NEEDED
      );

      // Update feature phase and create rejection record in a transaction
      const [approval] = await ctx.db.$transaction([
        ctx.db.approval.create({
          data: {
            featureRequestId: input.featureRequestId,
            reviewerId: ctx.session.user.id,
            status: ApprovalStatus.REJECTED,
            comment: input.comment,
            decidedAt: new Date(),
          },
        }),
        ctx.db.featureRequest.update({
          where: { id: input.featureRequestId },
          data: { phase: newPhase },
        }),
      ]);

      // Notify the feature creator that changes were requested (+ activity).
      await inngest.send({
        name: "notify/dispatch",
        data: {
          workspaceId: input.workspaceId,
          featureRequestId: input.featureRequestId,
          target: { includeFeatureCreator: true },
          type: "approval_rejected",
          title: "Release changes requested",
          body: `"${feature.title}" was sent back for fixes: ${input.comment}`,
          link: `/features/${feature.id}`,
          activity: {
            actorId: ctx.session.user.id,
            type: "feature.rejected",
            message: `Requested changes on "${feature.title}"`,
            entityType: "feature",
            entityId: feature.id,
          },
        },
      });

      return {
        approvalId: approval.id,
        status: ApprovalStatus.REJECTED,
        featurePhase: newPhase,
        rejectedBy: ctx.session.user.id,
        rejectedAt: approval.decidedAt,
        comment: input.comment,
        message:
          "Feature rejected and transitioned to FIX_NEEDED. Developer has been notified.",
      };
    }),

  /**
   * Notify all Approver-role users when a feature enters HUMAN_APPROVAL.
   * This is called internally when AI review completes with no blocking issues.
   *
   * Requirement: 6.6
   */
  notifyApprovers: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Find all workspace members with APPROVER role
      const approvers = await ctx.db.workspaceMember.findMany({
        where: {
          workspaceId: input.workspaceId,
          role: "APPROVER",
        },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Get feature details for the notification
      const feature = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        select: { id: true, title: true },
      });

      if (!feature) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Create a PENDING approval record to track the approval queue
      const approval = await ctx.db.approval.create({
        data: {
          featureRequestId: input.featureRequestId,
          status: ApprovalStatus.PENDING,
        },
      });

      // Dispatch real notifications (in-app + Slack) to the approvers.
      await inngest.send({
        name: "notify/dispatch",
        data: {
          workspaceId: input.workspaceId,
          featureRequestId: input.featureRequestId,
          target: { roles: ["APPROVER", "ADMIN"] },
          type: "approval_requested",
          title: "Feature awaiting your approval",
          body: `"${feature.title}" is ready for human approval.`,
          link: "/approvals",
          prefKey: "approvalRequested",
        },
      });

      return {
        approvalId: approval.id,
        notifiedApprovers: approvers.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          email: m.user.email,
        })),
        featureTitle: feature.title,
        message: `${approvers.length} approver(s) notified that "${feature.title}" is awaiting approval.`,
      };
    }),
});
