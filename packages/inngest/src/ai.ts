import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type LanguageModel } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { randomBytes } from "crypto";
import type { z } from "zod";

/**
 * Centralized AI model configuration for Inngest workflow functions.
 * Mirrors @shipflow/api/lib/ai — supports OpenAI-compatible and Anthropic
 * (Claude / FreeModel) providers, with FreeModel's streaming + metadata
 * requirements handled automatically.
 */
const PROVIDER = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

export const AI_MODEL_NAME =
  PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6"
    : process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;

/** Whether we're talking to the FreeModel Claude proxy (see lib/ai in @shipflow/api). */
export const IS_FREEMODEL =
  PROVIDER === "anthropic" &&
  !!ANTHROPIC_BASE_URL &&
  ANTHROPIC_BASE_URL.includes("freemodel.dev");

// FreeModel's "official Claude Code client" gate requires the CLI headers
// below plus a system prompt that begins with this identity line.
const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CLI_VERSION = process.env.CLAUDE_CLI_VERSION?.trim() || "1.0.83";
const CLAUDE_CODE_BETA =
  process.env.ANTHROPIC_BETA?.trim() || "claude-code-20250219";

const DEVICE_ID = randomBytes(16).toString("hex");
const SESSION_ID = randomBytes(6).toString("hex");

const freeModelFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.metadata = {
        user_id: JSON.stringify({
          session_id: SESSION_ID,
          device_id: DEVICE_ID,
        }),
      };
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // leave body untouched if it isn't JSON
    }
  }
  return fetch(input, init);
};

function buildModel(): LanguageModel {
  if (PROVIDER === "anthropic") {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
      ...(ANTHROPIC_BASE_URL ? { baseURL: ANTHROPIC_BASE_URL } : {}),
      ...(IS_FREEMODEL
        ? {
            headers: {
              "x-app": "cli",
              "user-agent": `claude-cli/${CLAUDE_CLI_VERSION} (external, cli)`,
              "anthropic-beta": CLAUDE_CODE_BETA,
            },
            fetch: freeModelFetch,
          }
        : {}),
    });
    return anthropic(AI_MODEL_NAME);
  }

  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_BASE_URL
      ? { baseURL: process.env.OPENAI_BASE_URL }
      : {}),
  });
  return openai(AI_MODEL_NAME);
}

/** Shared AI SDK model instance used across workflow functions. */
export const aiModel: LanguageModel = buildModel();

/** Extract a JSON object from a model's text response (tolerates code fences). */
function extractJson(text: string): string {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);
  return t;
}

/** Human-readable description of an AI SDK / provider error (status + body). */
function formatAiError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const status = e.statusCode ?? e.status;
    const msg = typeof e.message === "string" ? e.message : undefined;
    const body =
      typeof e.responseBody === "string" && e.responseBody.trim()
        ? e.responseBody.slice(0, 200)
        : undefined;
    const parts = [
      status ? `HTTP ${status}` : null,
      msg && !msg.includes("No output generated") ? msg : null,
      body ? `response: ${body}` : null,
    ].filter(Boolean);
    if (parts.length) return parts.join(" — ");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Structured generation helper using `streamText` + JSON-Schema instruction +
 * Zod validation. Provider-agnostic and compatible with FreeModel's Claude
 * proxy (which supports only basic streaming Messages). Stream/provider errors
 * are rethrown with HTTP status + body for diagnosability.
 */
export async function aiGenerateObject<SCHEMA extends z.ZodTypeAny>(opts: {
  schema: SCHEMA;
  prompt: string;
  system?: string;
}): Promise<{ object: z.infer<SCHEMA> }> {
  const jsonSchema = zodToJsonSchema(opts.schema, { target: "openApi3" });
  const ccPrefix = IS_FREEMODEL ? `${CLAUDE_CODE_IDENTITY}\n\n` : "";
  const system = `${ccPrefix}${opts.system ? opts.system + "\n\n" : ""}Respond with ONLY a single valid JSON object — no prose, no explanations, no markdown code fences — that strictly conforms to this JSON Schema:\n${JSON.stringify(jsonSchema)}`;

  let streamError: unknown = null;
  const result = streamText({
    model: aiModel,
    system,
    prompt: opts.prompt,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  let text = "";
  try {
    text = await result.text;
  } catch (err) {
    streamError = streamError ?? err;
  }

  if (streamError) {
    throw new Error(`AI provider request failed: ${formatAiError(streamError)}`);
  }

  if (!text.trim()) {
    throw new Error(
      "AI provider returned an empty response. This usually means the configured AI key/provider rejected the request (e.g. 403 / quota / model access). Check AI_PROVIDER and the corresponding API key."
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    throw new Error(
      `AI response was not valid JSON. First 200 chars: ${text.slice(0, 200)}`
    );
  }
  return { object: opts.schema.parse(raw) };
}
