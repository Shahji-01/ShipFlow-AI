/**
 * Triggers the AI review workflow for the most recent stored PR by sending the
 * `review/pr.review` event straight to the local Inngest dev server (:8288).
 * This exercises the QA agent end-to-end (diff → AI analysis → GitHub comments).
 *
 *   node scripts/trigger-review.mjs
 */
import { getPrisma, envFromWeb } from "./_lib.mjs";

const INNGEST = process.env.INNGEST_DEV_URL || "http://localhost:8288";
const EVENT_KEY = envFromWeb("INNGEST_EVENT_KEY") || "local";

const prisma = await getPrisma();
try {
  const pr = await prisma.pullRequest.findFirst({
    orderBy: { createdAt: "desc" },
    include: { repository: { include: { project: { select: { workspaceId: true } } } } },
  });
  if (!pr) throw new Error("No stored PR. Run simulate-github-webhook.mjs first.");

  const completed = await prisma.aIReview.count({ where: { pullRequestId: pr.id, status: "COMPLETED" } });
  const evt = {
    name: "review/pr.review",
    data: {
      pullRequestId: pr.id,
      repositoryId: pr.repositoryId,
      workspaceId: pr.repository.project.workspaceId,
      iteration: completed + 1,
    },
  };
  console.log(`Triggering AI review for PR #${pr.number} (${pr.repository.fullName}), iteration ${evt.data.iteration}`);
  const res = await fetch(`${INNGEST}/e/${EVENT_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(evt),
  });
  console.log(`→ Inngest event endpoint responded ${res.status}: ${await res.text()}`);
  console.log(`\nWatch the run at ${INNGEST} (AI Code Review). Then check with:`);
  console.log(`  node scripts/_check.mjs`);
} finally {
  await prisma.$disconnect();
}
