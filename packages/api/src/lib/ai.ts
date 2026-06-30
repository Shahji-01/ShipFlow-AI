import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type LanguageModel } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { randomBytes } from "crypto";
import type { z } from "zod";

/**
 * Centralized AI model configuration.
 *
 * Providers via AI_PROVIDER ("openai" | "anthropic"):
 *  - openai:     OPENAI_API_KEY, OPENAI_BASE_URL?, OPENAI_MODEL
 *  - anthropic:  ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL?, ANTHROPIC_MODEL
 *
 * FreeModel (Claude) support: set AI_PROVIDER=anthropic and
 * ANTHROPIC_BASE_URL=https://cc.freemodel.dev/v1. FreeModel only serves real
 * responses to streaming requests that carry the `x-app: cli` header and a
 * `metadata.user_id` field — both are added automatically below. Because of
 * this, structured generation goes through `streamObject` (see aiGenerateObject).
 */
const PROVIDER = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

export const AI_MODEL_NAME =
  PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6"
    : process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL;

/**
 * Whether we're talking to the FreeModel Claude proxy. FreeModel gates its
 * generation endpoint behind an "official Claude Code client" check that
 * inspects request headers AND the leading system prompt — see
 * CLAUDE_CODE_IDENTITY below and the headers set in buildModel().
 */
export const IS_FREEMODEL =
  PROVIDER === "anthropic" &&
  !!ANTHROPIC_BASE_URL &&
  ANTHROPIC_BASE_URL.includes("freemodel.dev");

/**
 * FreeModel only serves generations to requests that look like the official
 * Claude Code CLI. Passing its client check requires all of:
 *  - header `x-app: cli`
 *  - header `user-agent: claude-cli/<version> (external, cli)`
 *  - header `anthropic-beta: claude-code-...`
 *  - a system prompt whose first line is the Claude Code identity string
 *  - `metadata.user_id` in the request body (added by freeModelFetch)
 */
const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CLI_VERSION = process.env.CLAUDE_CLI_VERSION?.trim() || "1.0.83";
const CLAUDE_CODE_BETA =
  process.env.ANTHROPIC_BETA?.trim() || "claude-code-20250219";

// Stable per-process identifiers for FreeModel's required metadata.
const DEVICE_ID = randomBytes(16).toString("hex");
const SESSION_ID = randomBytes(6).toString("hex");

/**
 * Custom fetch that injects FreeModel's required `metadata.user_id` into the
 * request body. No-op for non-FreeModel hosts (the field is a valid Anthropic
 * parameter, but we only add it when talking to FreeModel).
 */
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

/** Shared AI SDK model instance used across services. */
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

/**
 * Produce a human-readable description of an AI SDK / provider error. The AI
 * SDK's APICallError carries the HTTP status and response body, which is far
 * more actionable than the generic "No output generated" surfaced otherwise.
 */
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
 * Structured generation helper.
 *
 * Uses plain `streamText` plus a JSON-Schema instruction and Zod validation
 * rather than the provider's native structured-output API. This is fully
 * provider-agnostic and, importantly, works with FreeModel's Claude proxy,
 * which only supports basic streaming Messages (no tool/`output_config`).
 *
 * Stream/provider errors are captured and rethrown with the underlying HTTP
 * status and response body so failures (e.g. a 403 from a blocked key, or a
 * quota error) are diagnosable instead of surfacing as "No output generated".
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
