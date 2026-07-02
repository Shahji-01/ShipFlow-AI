import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { FeaturePhase, SourceChannel } from "@shipflow/database";
import { createTRPCRouter, workspaceProcedure, rateLimitMiddleware } from "../trpc";
import { inngest } from "@shipflow/inngest";
import { analyzeFeatureRequest, suggestClarificationAnswer } from "../services/ai-analysis";
import { recordActivity } from "../services/activity";

/**
 * Zod schema for feature request title validation.
 */
const titleSchema = z
  .string()
  .min(1, "Title is required")
  .max(200, "Title cannot exceed 200 characters");

/**
 * Zod schema for feature request description validation.
 */
const descriptionSchema = z
  .string()
  .min(1, "Description is required")
  .max(5000, "Description cannot exceed 5000 characters");

/**
 * Feature request tRPC router.
 * Handles the full lifecycle of feature requests within a workspace-scoped project.
 */
export const featureRequestRouter = createTRPCRouter({
  /**
   * Create a new feature request.
   * Requires workspace membership. Sets phase to DISCOVERY.
   */
  create: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string(),
        title: titleSchema,
        description: descriptionSchema,
        source: z.nativeEnum(SourceChannel),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the project belongs to this workspace
      const project = await ctx.db.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: input.workspaceId,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this workspace.",
        });
      }

      const featureRequest = await ctx.db.featureRequest.create({
        data: {
          projectId: input.projectId,
          createdById: ctx.session.user.id,
          title: input.title,
          description: input.description,
          source: input.source,
          phase: FeaturePhase.DISCOVERY,
        },
      });

      await recordActivity(ctx.db, {
        workspaceId: input.workspaceId,
        actorId: ctx.session.user.id,
        type: "feature.created",
        message: `Created feature request "${featureRequest.title}"`,
        entityType: "feature",
        entityId: featureRequest.id,
      });

      return featureRequest;
    }),

  /**
   * List feature requests for a project.
   * Supports filtering by phase and source, with cursor-based pagination.
   */
  list: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        projectId: z.string(),
        phase: z.nativeEnum(FeaturePhase).optional(),
        source: z.nativeEnum(SourceChannel).optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify the project belongs to this workspace
      const project = await ctx.db.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: input.workspaceId,
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found in this workspace.",
        });
      }

      const where: Record<string, unknown> = {
        projectId: input.projectId,
      };

      if (input.phase) {
        where.phase = input.phase;
      }

      if (input.source) {
        where.source = input.source;
      }

      const featureRequests = await ctx.db.featureRequest.findMany({
        where,
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              clarifications: true,
              tasks: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (featureRequests.length > input.limit) {
        const nextItem = featureRequests.pop();
        nextCursor = nextItem?.id;
      }

      return {
        items: featureRequests,
        nextCursor,
      };
    }),

  /**
   * Get a single feature request by ID with clarifications and PRD.
   * Requires workspace membership.
   */
  getById: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          clarifications: {
            orderBy: { createdAt: "asc" },
          },
          prd: true,
          project: {
            select: {
              id: true,
              name: true,
              workspaceId: true,
            },
          },
        },
      });

      if (!featureRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Ensure it belongs to the correct workspace
      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      return featureRequest;
    }),

  /**
   * Update a feature request's title and/or description.
   * Only allowed when the feature request is in DISCOVERY phase.
   */
  update: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
        title: titleSchema.optional(),
        description: descriptionSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: {
          project: {
            select: { workspaceId: true },
          },
        },
      });

      if (!featureRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Ensure it belongs to the correct workspace
      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Only allow updates in DISCOVERY phase
      if (featureRequest.phase !== FeaturePhase.DISCOVERY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Feature request can only be updated during the DISCOVERY phase.",
        });
      }

      const data: Record<string, string> = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;

      const updated = await ctx.db.featureRequest.update({
        where: { id: input.id },
        data,
      });

      return updated;
    }),

  /**
   * Submit answers to clarification questions.
   * Requires workspace membership.
   */
  submitClarification: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        clarificationId: z.string(),
        answer: z.string().min(1, "Answer is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the clarification exists and belongs to the workspace
      const clarification = await ctx.db.clarification.findUnique({
        where: { id: input.clarificationId },
        include: {
          featureRequest: {
            include: {
              project: {
                select: { workspaceId: true },
              },
            },
          },
        },
      });

      if (!clarification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clarification not found.",
        });
      }

      // Ensure it belongs to the correct workspace
      if (
        clarification.featureRequest.project.workspaceId !== input.workspaceId
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clarification not found.",
        });
      }

      // Ensure it's for the correct feature request
      if (clarification.featureRequestId !== input.featureRequestId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Clarification does not belong to the specified feature request.",
        });
      }

      // Ensure the clarification hasn't already been answered
      if (clarification.answer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This clarification has already been answered.",
        });
      }

      const updated = await ctx.db.clarification.update({
        where: { id: input.clarificationId },
        data: {
          answer: input.answer,
          answeredAt: new Date(),
        },
      });

      return updated;
    }),

  /**
   * Skip a clarification question. Marks it resolved without an answer so it no
   * longer blocks PRD generation. Skipped questions are excluded from the PRD
   * context (no answer is provided to the AI).
   */
  skipClarification: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        clarificationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clarification = await ctx.db.clarification.findUnique({
        where: { id: input.clarificationId },
        include: {
          featureRequest: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (
        !clarification ||
        clarification.featureRequest.project.workspaceId !== input.workspaceId
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clarification not found.",
        });
      }

      if (clarification.featureRequestId !== input.featureRequestId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Clarification does not belong to the specified feature request.",
        });
      }

      if (clarification.answer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This clarification has already been answered.",
        });
      }

      const updated = await ctx.db.clarification.update({
        where: { id: input.clarificationId },
        data: { skipped: true, answeredAt: new Date() },
      });

      return updated;
    }),

  /**
   * Use AI to draft (or refine) an answer to a clarification question, grounded
   * in the feature request. Returns the suggested text without saving it — the
   * user reviews/edits before submitting.
   */
  suggestAnswer: workspaceProcedure
    .use(rateLimitMiddleware("clarify.suggest", 30, 60_000))
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        clarificationId: z.string(),
        currentDraft: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const clarification = await ctx.db.clarification.findUnique({
        where: { id: input.clarificationId },
        include: {
          featureRequest: {
            include: { project: { select: { workspaceId: true } } },
          },
        },
      });

      if (
        !clarification ||
        clarification.featureRequest.project.workspaceId !==
          input.workspaceId ||
        clarification.featureRequestId !== input.featureRequestId
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Clarification not found.",
        });
      }

      const answer = await suggestClarificationAnswer(
        clarification.featureRequest.title,
        clarification.featureRequest.description,
        clarification.question,
        input.currentDraft
      );

      return { answer };
    }),

  /**
   * Trigger PRD generation workflow.
   * Requires all clarifications to be answered before triggering.
   */
  triggerPRD: workspaceProcedure
    .use(rateLimitMiddleware("prd.trigger", 10, 60_000))
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request exists and belongs to the workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          clarifications: true,
          project: {
            select: { workspaceId: true },
          },
          prd: true,
        },
      });

      if (!featureRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Ensure it belongs to the correct workspace
      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Ensure all clarifications are resolved (answered or explicitly skipped)
      const unanswered = featureRequest.clarifications.filter(
        (c) => !c.answer && !c.skipped
      );

      if (unanswered.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `All clarification questions must be answered or skipped before generating a PRD. ${unanswered.length} question(s) remain.`,
        });
      }

      // Allow regeneration of an existing PRD (e.g. after answering more
      // clarifications), but never clobber an APPROVED one. Snapshot the
      // current content into version history before regenerating.
      if (featureRequest.prd) {
        if (featureRequest.prd.status === "APPROVED") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This PRD is already approved and can't be regenerated. Create a new feature request to start over.",
          });
        }
        await ctx.db.pRDVersion.create({
          data: {
            prdId: featureRequest.prd.id,
            content: featureRequest.prd.content as object,
            editedBy: ctx.session.user.id,
          },
        });
      }

      // Send the inngest event to trigger PRD generation
      await inngest.send({
        name: "feature/prd.generate",
        data: {
          featureRequestId: input.featureRequestId,
          workspaceId: input.workspaceId,
          userId: ctx.session.user.id,
        },
      });

      return { success: true, message: "PRD generation workflow started." };
    }),

  /**
   * Analyze a feature request for completeness using AI.
   * Checks for problem statement, user impact, and desired outcome.
   * Generates follow-up questions when elements are missing and stores them as Clarification records.
   * Detects potential duplicate functionality.
   */
  analyze: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        featureRequestId: z.string(),
        projectContext: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the feature request exists and belongs to the workspace
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.featureRequestId },
        include: {
          clarifications: true,
          project: {
            select: { workspaceId: true, name: true, description: true },
          },
        },
      });

      if (!featureRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Ensure it belongs to the correct workspace
      if (featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Build project context for duplicate detection
      const projectContext =
        input.projectContext ??
        `Project: ${featureRequest.project.name}${featureRequest.project.description ? ` - ${featureRequest.project.description}` : ""}`;

      // Run AI completeness analysis, accounting for clarifications already
      // asked/answered so it doesn't repeat questions or ignore prior answers.
      const existingClarifications = featureRequest.clarifications.map((c) => ({
        question: c.question,
        answer: c.answer,
        skipped: c.skipped,
      }));

      const analysis = await analyzeFeatureRequest(
        featureRequest.title,
        featureRequest.description,
        projectContext,
        existingClarifications
      );

      // If the feature request is already complete, return immediately without creating clarifications
      if (analysis.isComplete && !analysis.isDuplicate) {
        return {
          ...analysis,
          clarificationIds: [],
        };
      }

      // Store generated questions as Clarification records — but never create
      // duplicates of questions already asked (case/space-insensitive match).
      const clarificationIds: string[] = [];

      const normalize = (s: string) =>
        s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w ]/g, "").trim();
      const existingSet = new Set(
        featureRequest.clarifications.map((c) => normalize(c.question))
      );
      const newQuestions = analysis.questions.filter((q) => {
        const n = normalize(q);
        if (existingSet.has(n)) return false;
        existingSet.add(n); // also dedupe within this batch
        return true;
      });

      if (newQuestions.length > 0) {
        const clarifications = await ctx.db.clarification.createManyAndReturn({
          data: newQuestions.map((question) => ({
            featureRequestId: input.featureRequestId,
            question,
          })),
        });

        clarificationIds.push(...clarifications.map((c) => c.id));
      }

      return {
        ...analysis,
        // Reflect only the questions actually persisted this run.
        questions: newQuestions,
        clarificationIds,
      };
    }),

  /**
   * Delete a feature request.
   */
  delete: workspaceProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const featureRequest = await ctx.db.featureRequest.findUnique({
        where: { id: input.id },
        include: {
          project: {
            select: { workspaceId: true },
          },
        },
      });

      if (!featureRequest || featureRequest.project.workspaceId !== input.workspaceId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Feature request not found.",
        });
      }

      // Manually delete workflows as they lack onDelete: Cascade in prisma schema
      await ctx.db.workflow.deleteMany({
        where: { featureRequestId: input.id },
      });

      await ctx.db.featureRequest.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
