import { z } from "zod";
import { aiGenerateObject } from "../lib/ai";

/**
 * Schema for the AI completeness analysis result.
 */
export const analysisResultSchema = z.object({
  isComplete: z
    .boolean()
    .describe(
      "Whether the feature request contains all required elements (problem statement, user impact, desired outcome)"
    ),
  missingElements: z
    .array(z.enum(["problem_statement", "user_impact", "desired_outcome"]))
    .describe("List of elements that are missing from the feature request"),
  questions: z
    .array(z.string())
    .min(0)
    .max(5)
    .describe(
      "Follow-up questions to ask the user when elements are missing (1-5 questions)"
    ),
  isDuplicate: z
    .boolean()
    .describe(
      "Whether the requested functionality likely already exists in the product"
    ),
  duplicateGuidance: z
    .string()
    .nullable()
    .describe(
      "If duplicate, guidance on how to use the existing functionality"
    ),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

/**
 * Analyzes a feature request for completeness using AI.
 *
 * Checks for the presence of:
 * - Problem statement: What problem does this solve?
 * - User impact: Who is affected and how?
 * - Desired outcome: What should the end result look like?
 *
 * Also detects if the requested functionality might already exist.
 *
 * @param title - The feature request title
 * @param description - The feature request description
 * @param projectContext - Optional context about the project's existing features
 * @returns Structured analysis result
 */
export async function analyzeFeatureRequest(
  title: string,
  description: string,
  projectContext?: string,
  existingClarifications?: Array<{
    question: string;
    answer: string | null;
    skipped?: boolean;
  }>
): Promise<AnalysisResult> {
  const systemPrompt = `You are an expert product analyst reviewing feature requests for completeness and quality.

Your job is to analyze a feature request and determine:
1. Whether it contains a clear problem statement (what problem does this solve?)
2. Whether it describes the user impact (who is affected and how?)
3. Whether it specifies a desired outcome (what should the end result look like?)

You may be given clarification questions that were already asked, along with their answers. Treat answered clarifications as part of the request: information covered by an answer is NOT missing. Do NOT re-ask a question that has already been asked or answered, and do NOT ask a question that is merely a rephrasing of an existing one. Only generate NEW follow-up questions for information that is still genuinely missing after accounting for the answers. If every essential element is covered by the description or the answers, set isComplete to true and return an empty questions array.

When elements are missing, generate targeted, NON-duplicate follow-up questions (at most 5). Questions should be specific and actionable.

If the feature request describes functionality that might already exist in the product (based on provided project context), flag it as a potential duplicate and provide guidance on how to use existing functionality.

Be thorough but fair. A feature request doesn't need to be perfectly structured — it just needs to contain the essential elements in some form (including via answered clarifications).`;

  const answered = (existingClarifications ?? []).filter((c) => c.answer);
  const alreadyAsked = (existingClarifications ?? []).map((c) => c.question);
  const clarificationBlock =
    existingClarifications && existingClarifications.length > 0
      ? `\n**Clarifications already asked (do not repeat these or rephrasings of them):**\n${alreadyAsked
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}\n\n**Answers provided so far (treat this as part of the request):**\n${
          answered.length > 0
            ? answered.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
            : "(none answered yet)"
        }\n`
      : "";

  const userPrompt = `Analyze the following feature request for completeness:

**Title:** ${title}

**Description:** ${description}

${projectContext ? `**Existing Product Context:**\n${projectContext}` : ""}
${clarificationBlock}
Evaluate whether the request contains:
- A problem statement (what problem is being solved?)
- User impact (who benefits and how?)
- Desired outcome (what is the expected end state?)

Account for the answers already provided. Only generate follow-up questions for information that is STILL missing — never repeat or rephrase a question that was already asked. If nothing essential is missing, return isComplete=true with an empty questions list.
Also check if this functionality might already exist based on the project context provided.`;

  const { object } = await aiGenerateObject({
    schema: analysisResultSchema,
    system: systemPrompt,
    prompt: userPrompt,
  });

  return object;
}

/**
 * Schema for an AI-suggested clarification answer.
 */
const suggestedAnswerSchema = z.object({
  answer: z
    .string()
    .describe(
      "A concise, concrete answer to the clarification question, written from the product owner's perspective"
    ),
});

/**
 * Drafts (or refines) an answer to a clarification question using AI, grounded
 * in the feature request's title and description. When a draft is provided, the
 * AI improves/expands it instead of starting from scratch.
 */
export async function suggestClarificationAnswer(
  title: string,
  description: string,
  question: string,
  currentDraft?: string
): Promise<string> {
  const system = `You are a product owner answering clarification questions about a feature request you submitted. Answer in the first person, concretely and concisely (2-4 sentences). Make reasonable, sensible assumptions consistent with the feature description rather than asking further questions. Do not restate the question.`;

  const prompt = `Feature title: ${title}

Feature description:
${description}

Clarification question:
${question}
${currentDraft?.trim() ? `\nThere is an existing draft answer to refine and improve:\n${currentDraft}\n\nProduce an improved, clearer version.` : "\nProduce a suitable answer."}`;

  const { object } = await aiGenerateObject({
    schema: suggestedAnswerSchema,
    system,
    prompt,
  });

  return object.answer;
}
