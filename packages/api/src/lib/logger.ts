/**
 * Structured logger with a stable JSON shape for production log aggregation.
 *
 * In development it pretty-prints; in production it emits single-line JSON
 * that ingests cleanly into Datadog / Logtail / Vercel log drains. Errors are
 * additionally forwarded to Sentry if SENTRY_DSN is configured (lazy import to
 * avoid bundling when unused).
 */

type Level = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

const isProd = process.env.NODE_ENV === "production";

function emit(level: Level, message: string, fields?: LogFields) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields,
  };

  if (isProd) {
    // Single-line JSON for log drains.
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    const rest = fields ? fields : "";
    if (level === "error") console.error(prefix, message, rest);
    else if (level === "warn") console.warn(prefix, message, rest);
    else console.log(prefix, message, rest);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => {
    if (!isProd) emit("debug", message, fields);
  },
  info: (message: string, fields?: LogFields) => emit("info", message, fields),
  warn: (message: string, fields?: LogFields) => emit("warn", message, fields),
  error: (message: string, error?: unknown, fields?: LogFields) => {
    const errorFields: LogFields = { ...fields };
    if (error instanceof Error) {
      errorFields.error = error.message;
      errorFields.stack = error.stack;
    } else if (error !== undefined) {
      errorFields.error = String(error);
    }
    emit("error", message, errorFields);
    void captureException(error, message, fields);
  },
};

/**
 * Forward an exception to Sentry when configured. Safe no-op otherwise.
 */
async function captureException(
  error: unknown,
  message: string,
  fields?: LogFields
): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    // Lazy import so Sentry is optional and not bundled unless used.
    // @ts-expect-error - optional peer dependency, may not be installed
    const Sentry = await import("@sentry/node").catch(() => null);
    if (!Sentry) return;
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message, ...fields } });
    } else {
      Sentry.captureMessage(message, { extra: { error, ...fields } });
    }
  } catch {
    // Never let logging crash the request.
  }
}
