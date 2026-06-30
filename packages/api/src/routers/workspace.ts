import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BillingTier, WorkspaceRole } from "@shipflow/database";
import { Permission } from "@shipflow/auth/server";
import {
  createTRPCRouter,
  protectedProcedure,
  workspaceProcedure,
  roleGuardedProcedure,
} from "../trpc";
import { encryptSecret } from "../lib/crypto";
import { sendSlackMessage } from "../services/slack";
import { sendEmail, emailLayout } from "../services/email";
import { inngest } from "@shipflow/inngest";

/** Resolve the public base URL for building links in emails/notifications. */
function getBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}

/**
 * Maximum number of workspaces a single user can create.
 */
const MAX_WORKSPACES_PER_USER = 10;

/**
 * Maximum number of workspace memberships a single user can hold.
 */
const MAX_MEMBERSHIPS_PER_USER = 20;

/**
 * Invitation expiry duration in days.
 */
const INVITATION_EXPIRY_DAYS = 7;

/**
 * Generates a URL-friendly slug from a workspace name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const workspaceRouter = createTRPCRouter({
  /**
   * Create a new workspace.
   * Atomic operation: creates workspace + adds creator as ADMIN + provisions billing.
   * Enforces max 10 workspaces per user.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Workspace name is required").max(100),
        slug: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Enforce workspace creation limit (max 10 per user)
      const createdCount = await ctx.db.workspaceMember.count({
        where: {
          userId,
          role: WorkspaceRole.ADMIN,
        },
      });

      if (createdCount >= MAX_WORKSPACES_PER_USER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached the maximum limit of ${MAX_WORKSPACES_PER_USER} workspaces.`,
        });
      }

      // Enforce membership limit (max 20 per user)
      const membershipCount = await ctx.db.workspaceMember.count({
        where: { userId },
      });

      if (membershipCount >= MAX_MEMBERSHIPS_PER_USER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached the maximum limit of ${MAX_MEMBERSHIPS_PER_USER} workspace memberships.`,
        });
      }

      const slug = input.slug || generateSlug(input.name);

      // Check slug uniqueness
      const existingWorkspace = await ctx.db.workspace.findUnique({
        where: { slug },
      });

      if (existingWorkspace) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A workspace with this slug already exists.",
        });
      }

      // Atomic provisioning: workspace + admin member + billing subscription
      const workspace = await ctx.db.$transaction(async (tx) => {
        const ws = await tx.workspace.create({
          data: {
            name: input.name,
            slug,
          },
        });

        // Add creator as ADMIN
        await tx.workspaceMember.create({
          data: {
            workspaceId: ws.id,
            userId,
            role: WorkspaceRole.ADMIN,
          },
        });

        // Provision billing subscription with FREE tier
        const now = new Date();
        const billingCycleEnd = new Date(now);
        billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 1);

        await tx.billingSubscription.create({
          data: {
            workspaceId: ws.id,
            tier: BillingTier.FREE,
            aiReviewCredits: 10,
            maxRepositories: 2,
            billingCycleStart: now,
            billingCycleEnd,
          },
        });

        return ws;
      });

      return workspace;
    }),

  /**
   * Update workspace name/slug. ADMIN only.
   */
  update: roleGuardedProcedure(Permission.MANAGE_WORKSPACE_SETTINGS)
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const data: Record<string, string> = {};
      if (input.name) data.name = input.name;
      if (input.slug) {
        // Check slug uniqueness
        const existing = await ctx.db.workspace.findFirst({
          where: { slug: input.slug, id: { not: input.workspaceId } },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A workspace with this slug already exists.",
          });
        }
        data.slug = input.slug;
      }

      const workspace = await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data,
      });

      return workspace;
    }),

  /**
   * Configure (or clear) the workspace's Slack Incoming Webhook for
   * notifications. ADMIN only. The URL is encrypted at rest and verified with
   * a test ping before being saved. Pass null to disconnect.
   */
  setSlackWebhook: roleGuardedProcedure(Permission.MANAGE_WORKSPACE_SETTINGS)
    .input(
      z.object({
        workspaceId: z.string(),
        webhookUrl: z
          .string()
          .url()
          .startsWith(
            "https://hooks.slack.com/",
            "Must be a Slack Incoming Webhook URL (https://hooks.slack.com/...)."
          )
          .nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.webhookUrl === null) {
        await ctx.db.workspace.update({
          where: { id: input.workspaceId },
          data: { slackWebhookUrl: null },
        });
        return { connected: false };
      }

      // Verify the webhook works before persisting it.
      const ok = await sendSlackMessage(
        input.webhookUrl,
        "✅ ShipFlow AI is now connected to this Slack channel."
      );
      if (!ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Could not deliver a test message to that Slack webhook. Check the URL and try again.",
        });
      }

      await ctx.db.workspace.update({
        where: { id: input.workspaceId },
        data: { slackWebhookUrl: encryptSecret(input.webhookUrl) },
      });

      return { connected: true };
    }),

  /**
   * Delete a workspace. ADMIN only.
   * Cascades to all related data.
   */
  delete: roleGuardedProcedure(Permission.MANAGE_WORKSPACE_SETTINGS)
    .input(z.object({ workspaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.workspace.delete({
        where: { id: input.workspaceId },
      });

      return { success: true };
    }),

  /**
   * Get a workspace by ID. Requires membership.
   */
  getById: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        include: {
          billing: true,
          _count: {
            select: {
              members: true,
              projects: true,
            },
          },
        },
      });

      if (!workspace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workspace not found.",
        });
      }

      // Never expose the raw (encrypted) Slack webhook URL to clients — only
      // surface whether an integration is configured.
      const { slackWebhookUrl, ...rest } = workspace;
      return { ...rest, slackConnected: !!slackWebhookUrl };
    }),

  /**
   * List all workspaces the current user belongs to.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.workspaceMember.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                members: true,
                projects: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }),

  /**
   * List members of a workspace. Requires membership.
   */
  listMembers: workspaceProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      });

      return members;
    }),

  /**
   * Update a member's role. ADMIN only.
   */
  updateMemberRole: roleGuardedProcedure(Permission.MANAGE_ROLES)
    .input(
      z.object({
        workspaceId: z.string(),
        memberId: z.string(),
        role: z.nativeEnum(WorkspaceRole),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Prevent admin from changing their own role
      const member = await ctx.db.workspaceMember.findUnique({
        where: { id: input.memberId },
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      }

      if (member.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot change your own role.",
        });
      }

      const updated = await ctx.db.workspaceMember.update({
        where: { id: input.memberId },
        data: { role: input.role },
      });

      return updated;
    }),

  /**
   * Remove a member from the workspace. ADMIN only.
   */
  removeMember: roleGuardedProcedure(Permission.MANAGE_MEMBERS)
    .input(
      z.object({
        workspaceId: z.string(),
        memberId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.workspaceMember.findUnique({
        where: { id: input.memberId },
      });

      if (!member) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      }

      // Prevent admin from removing themselves
      if (member.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot remove yourself from the workspace.",
        });
      }

      await ctx.db.workspaceMember.delete({
        where: { id: input.memberId },
      });

      return { success: true };
    }),

  /**
   * Invite a user to the workspace. ADMIN only.
   * Creates an invitation with 7-day expiry.
   */
  invite: roleGuardedProcedure(Permission.MANAGE_MEMBERS)
    .input(
      z.object({
        workspaceId: z.string(),
        email: z.string().email("A valid email address is required."),
        role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.MEMBER),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user is already a member
      const existingUser = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        const existingMember = await ctx.db.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: input.workspaceId,
              userId: existingUser.id,
            },
          },
        });

        if (existingMember) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This user is already a member of this workspace.",
          });
        }

        // Check if the target user would exceed membership limit
        const targetMembershipCount = await ctx.db.workspaceMember.count({
          where: { userId: existingUser.id },
        });

        if (targetMembershipCount >= MAX_MEMBERSHIPS_PER_USER) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `The invited user has reached the maximum limit of ${MAX_MEMBERSHIPS_PER_USER} workspace memberships.`,
          });
        }
      }

      // Check for existing pending invitation
      const existingInvitation = await ctx.db.workspaceInvitation.findFirst({
        where: {
          workspaceId: input.workspaceId,
          email: input.email,
          acceptedAt: null,
          declinedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvitation) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending invitation already exists for this email.",
        });
      }

      // Create invitation with 7-day expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

      const invitation = await ctx.db.workspaceInvitation.create({
        data: {
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          invitedById: ctx.session.user.id,
          expiresAt,
        },
      });

      // Email the invitee a link to accept (best-effort — no-op without Resend).
      const workspace = await ctx.db.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });
      const inviteLink = `${getBaseUrl()}/invite/${invitation.id}`;
      const wsName = workspace?.name ?? "a workspace";
      await sendEmail({
        to: input.email,
        subject: `You've been invited to ${wsName} on ShipFlow`,
        html: emailLayout(
          `You've been invited to ${wsName}`,
          `<p style="margin:0 0 16px;color:#4a4742">${ctx.session.user.name ?? ctx.session.user.email} invited you to join <strong>${wsName}</strong> on ShipFlow as a ${input.role.toLowerCase()}.</p>
           <p style="margin:0 0 24px"><a href="${inviteLink}" style="display:inline-block;background:#2383e2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Accept invitation</a></p>
           <p style="margin:0;color:#8a8780;font-size:13px">This invitation expires in ${INVITATION_EXPIRY_DAYS} days. If you weren't expecting this, you can ignore this email.</p>`
        ),
        text: `You've been invited to join ${wsName} on ShipFlow. Accept: ${inviteLink}`,
      });

      return invitation;
    }),

  /**
   * Accept a workspace invitation.
   * Validates expiry, creates membership with assigned role.
   */
  acceptInvite: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { id: input.invitationId },
        include: { workspace: true },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      // Validate the invitation belongs to this user
      if (invitation.email !== ctx.session.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation is not for your account.",
        });
      }

      // Check if already accepted or declined
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been accepted.",
        });
      }

      if (invitation.declinedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been declined.",
        });
      }

      // Validate expiry
      if (new Date() > invitation.expiresAt) {
        // Notify the inviting admin about expiry
        // In a production system, this would trigger a notification event
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has expired.",
        });
      }

      // Enforce membership limit for the accepting user
      const membershipCount = await ctx.db.workspaceMember.count({
        where: { userId: ctx.session.user.id },
      });

      if (membershipCount >= MAX_MEMBERSHIPS_PER_USER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You have reached the maximum limit of ${MAX_MEMBERSHIPS_PER_USER} workspace memberships.`,
        });
      }

      // Atomically: mark invitation accepted + create membership
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.workspaceInvitation.update({
          where: { id: input.invitationId },
          data: { acceptedAt: new Date() },
        });

        const membership = await tx.workspaceMember.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId: ctx.session.user.id,
            role: invitation.role,
          },
        });

        return membership;
      });

      return result;
    }),

  /**
   * Decline a workspace invitation.
   * Notifies the inviting Admin.
   */
  declineInvite: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.workspaceInvitation.findUnique({
        where: { id: input.invitationId },
        include: { workspace: true },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found.",
        });
      }

      // Validate the invitation belongs to this user
      if (invitation.email !== ctx.session.user.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation is not for your account.",
        });
      }

      // Check if already handled
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been accepted.",
        });
      }

      if (invitation.declinedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invitation has already been declined.",
        });
      }

      // Mark as declined
      await ctx.db.workspaceInvitation.update({
        where: { id: input.invitationId },
        data: { declinedAt: new Date() },
      });

      // Notify the inviting admin that the invite was declined.
      await inngest.send({
        name: "notify/dispatch",
        data: {
          workspaceId: invitation.workspaceId,
          target: { userIds: [invitation.invitedById] },
          type: "invitation_declined",
          title: "Invitation declined",
          body: `${ctx.session.user.email} declined your invitation to ${invitation.workspace.name}.`,
          link: "/workspace",
          slack: false,
        },
      });

      return { success: true };
    }),
});
