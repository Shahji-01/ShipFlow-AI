import { logger } from "../lib/logger";

/**
 * Transactional email via Resend. Fully optional: when RESEND_API_KEY is not
 * set, calls become structured-log no-ops so local/dev never breaks.
 *
 * Uses the REST API directly (no SDK dependency) to keep the bundle small.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "ShipFlow <noreply@shipflow.ai>";

  if (!apiKey) {
    logger.info("Email skipped (RESEND_API_KEY not set)", {
      to: input.to,
      subject: input.subject,
    });
    return false;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("Email send failed", undefined, {
        status: res.status,
        body,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.error("Email send threw", err);
    return false;
  }
}

/** Minimal branded HTML wrapper for transactional emails. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf9f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f1d1a">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
      <div style="width:28px;height:28px;border-radius:8px;background:#2383e2;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">⚡</div>
      <span style="font-size:18px;font-weight:700">ShipFlow</span>
    </div>
    <div style="background:#fff;border:1px solid #ececec;border-radius:12px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="color:#8a8780;font-size:12px;margin-top:24px;text-align:center">
      ShipFlow AI · AI-powered software delivery
    </p>
  </div></body></html>`;
}
