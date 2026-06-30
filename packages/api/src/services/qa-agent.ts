import { z } from "zod";
import { aiGenerateObject } from "../lib/ai";

/**
 * Schema for a single review issue found by the QA Agent.
 */
const reviewIssueSchema = z.object({
  category: z
    .enum(["BLOCKING", "NON_BLOCKING"])
    .describe(
      "BLOCKING if issue violates PRD requirement, acceptance criterion, or introduces security vulnerability. NON_BLOCKING for style suggestions, minor optimizations, and other non-critical issues."
    ),
  filePath: z.string().describe("File path where the issue was found"),
  lineNumber: z
    .number()
    .nullable()
    .describe("Line number where the issue is located, if applicable"),
  title: z.string().describe("Short summary title of the issue"),
  description: z
    .string()
    .describe(
      "Detailed description of the issue with recommendation for fixing"
    ),
});

/**
 * Schema for the full QA Agent review result.
 */
export const qaReviewResultSchema = z.object({
  issues: z
    .array(reviewIssueSchema)
    .describe("List of issues identified in the code review"),
  summary: z
    .string()
    .describe("Overall summary of the review with key findings"),
});

export type QAReviewResult = z.infer<typeof qaReviewResultSchema>;

export interface QAReviewContext {
  /** PRD content (structured JSON or text) */
  prdContent: unknown;
  /** Acceptance criteria from the PRD */
  acceptanceCriteria: string;
  /** Engineering tasks related to the PR */
  tasks: Array<{ title: string; description: string; acceptanceCriteria: string }>;
  /** Diff summary with file paths and change counts */
  diffSummary: {
    files: Array<{ path: string; additions: number; deletions: number; patch?: string }>;
  };
  /** Pull request title and description */
  prTitle: string;
  prDescription?: string;
  /** Optional team-specific review guidelines to apply */
  reviewGuidelines?: string | null;
}

/**
 * QA Agent that reviews code changes against PRD requirements using AI.
 *
 * Reviews code changes against:
 * - PRD requirements
 * - Acceptance criteria
 * - Engineering tasks
 * - Security concerns
 * - Performance considerations
 * - Edge cases
 * - Linting and formatting rules
 *
 * Categorizes issues as:
 * - BLOCKING: Violates PRD requirement, acceptance criterion, or introduces security vulnerability
 * - NON_BLOCKING: Style suggestions, minor optimizations, and other non-critical issues
 *
 * Requirements: 5.1, 5.2
 */
export async function runQAReview(
  context: QAReviewContext
): Promise<QAReviewResult> {
  const systemPrompt = `You are an expert QA engineer performing a thorough code review for a pull request. Your role is to review code changes against the project's Product Requirements Document (PRD), acceptance criteria, and engineering tasks.

You must identify issues and categorize each one:
- **BLOCKING**: Issues that MUST be fixed before merging. This includes:
  - Violations of PRD requirements
  - Violations of acceptance criteria
  - Security vulnerabilities (SQL injection, XSS, auth bypass, data exposure, etc.)
  - Logic errors that break expected functionality
  - Missing required functionality specified in tasks

- **NON_BLOCKING**: Issues that are recommendations but don't prevent merging. This includes:
  - Code style and formatting suggestions
  - Minor performance optimizations
  - Documentation improvements
  - Refactoring suggestions
  - Minor best practice improvements

Be thorough but fair. Focus on substantive issues rather than nitpicking. If the code meets the requirements and is secure, acknowledge that.

For each issue, provide:
- The file path where the issue exists
- The line number if applicable (null if it's a general issue)
- A clear, concise title
- A detailed description explaining why it's an issue and how to fix it${
    context.reviewGuidelines
      ? `\n\nThis team has additional review guidelines you MUST apply:\n${context.reviewGuidelines}`
      : ""
  }`;

  const userPrompt = `Review the following pull request against the PRD and tasks:

## Pull Request
**Title:** ${context.prTitle}
${context.prDescription ? `**Description:** ${context.prDescription}` : ""}

## PRD Content
${JSON.stringify(context.prdContent, null, 2)}

## Acceptance Criteria
${context.acceptanceCriteria}

## Engineering Tasks
${context.tasks.map((t) => `- **${t.title}**: ${t.description}\n  Acceptance: ${t.acceptanceCriteria}`).join("\n")}

## Changed Files
${context.diffSummary.files.map((f) => `- ${f.path} (+${f.additions}, -${f.deletions})${f.patch ? `\n\`\`\`\n${f.patch}\n\`\`\`` : ""}`).join("\n")}

Please review the code changes against:
1. PRD requirements - Does the code implement what the PRD specifies?
2. Acceptance criteria - Does the code satisfy all acceptance criteria?
3. Engineering tasks - Does the code complete the assigned tasks?
4. Security - Are there any security vulnerabilities?
5. Performance - Are there any performance concerns?
6. Edge cases - Are edge cases handled properly?
7. Code quality - Are there linting/formatting issues or best practice violations?

Provide your findings as a structured list of issues with appropriate categorization.`;

  const { object } = await aiGenerateObject({
    schema: qaReviewResultSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  return object;
}
