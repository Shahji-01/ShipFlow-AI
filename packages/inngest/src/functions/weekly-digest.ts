import { inngest } from "../client";
import prisma from "@shipflow/database";

/**
 * Weekly digest email.
 *
 * Runs Monday 09:00 UTC. For each workspace with activity in the last 7 days,
 * emails a summary to members who have opted in via the `weeklyDigest`
 * notification preference. Email is sent via the Resend REST API; when
 * RESEND_API_KEY is unset the send is a no-op so local/dev never breaks.
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function sendDigestEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = process.env.EMAIL_FROM ?? "ShipFlow <noreply@shipflow.dev>";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch {
    // best-effort
  }
}

export const weeklyDigest = inngest.createFunction(
  { id: "weekly-digest", name: "Weekly Activity Digest" },
  { cron: "0 9 * * 1" },
  async ({ step }) => {
    const sent = await step.run("send-digests", async () => {
      const since = new Date(Date.now() - SEVEN_DAYS_MS);
      let emailsSent = 0;

      const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true },
      });

      for (const ws of workspaces) {
        const activities = await prisma.activity.findMany({
          where: { workspaceId: ws.id, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { type: true, message: true, createdAt: true },
        });

        if (activities.length === 0) continue;

        // Members who opted into the weekly digest.
        const members = await prisma.workspaceMember.findMany({
          where: { workspaceId: ws.id },
          select: { user: { select: { email: true, notificationPrefs: true } } },
        });

        const recipients = members
          .filter((m) => {
            const prefs =
              (m.user.notificationPrefs as Record<string, boolean> | null) ??
              {};
            return prefs.weeklyDigest === true;
          })
          .map((m) => m.user.email);

        if (recipients.length === 0) continue;

        const items = activities
          .slice(0, 15)
          .map(
            (a) =>
              `<li style="margin:0 0 6px;color:#4a4742">${a.message}</li>`
          )
          .join("");

        const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#faf9f7;padding:32px;color:#1f1d1a">
          <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ececec;border-radius:12px;padding:28px">
            <h1 style="font-size:18px;margin:0 0 4px">${ws.name} — weekly digest</h1>
            <p style="margin:0 0 16px;color:#8a8780;font-size:13px">${activities.length} update(s) in the last 7 days</p>
            <ul style="padding-left:18px;margin:0">${items}</ul>
          </div>
        </body></html>`;

        for (const email of recipients) {
          await sendDigestEmail(
            email,
            `Your weekly digest for ${ws.name}`,
            html
          );
          emailsSent++;
        }
      }

      return emailsSent;
    });

    return { emailsSent: sent };
  }
);
