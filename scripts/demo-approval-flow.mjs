/**
 * Drives a real feature end-to-end into the Approval Queue:
 *   link a task → open a real GitHub PR on that branch → signed webhook →
 *   PR processing links PR↔task → AI review runs → (no blocking) feature
 *   transitions to HUMAN_APPROVAL and appears in Approvals.
 *
 *   node scripts/demo-approval-flow.mjs
 */
import { getPrisma, getConnectedRepo, decryptSecret, signPayload, gh } from "./_lib.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prisma = await getPrisma();
try {
  const { repo, githubToken } = await getConnectedRepo(prisma);
  if (!githubToken) throw new Error("No GitHub token for this workspace.");
  const [owner, name] = repo.fullName.split("/");
  const api = gh(githubToken);

  // 1. A DEVELOPMENT feature in the SAME project as the connected repo, with tasks.
  const feature = await prisma.featureRequest.findFirst({
    where: { phase: "DEVELOPMENT", projectId: repo.project.id, tasks: { some: {} } },
    include: { tasks: { orderBy: { order: "asc" } } },
  });
  if (!feature) {
    throw new Error(
      `No DEVELOPMENT feature with tasks found in project "${repo.project.name}" (the repo's project). ` +
      `Connect the repo to the project that has your feature, or move a feature to DEVELOPMENT.`
    );
  }
  const task = feature.tasks[0];
  const branch = `shipflow-feat-${Date.now()}`;
  console.log(`Feature: "${feature.title}"  (phase ${feature.phase})`);
  console.log(`Linking task "${task.title}" → branch ${branch}`);

  await prisma.task.update({
    where: { id: task.id },
    data: { linkedBranch: branch, status: "IN_PROGRESS" },
  });

  // 2. Create the branch + a file + PR on it.
  const ref = await api("GET", `/repos/${owner}/${name}/git/ref/heads/${repo.defaultBranch || "main"}`);
  if (!ref.ok) throw new Error(`base ref: ${ref.status} ${JSON.stringify(ref.json)}`);
  const created = await api("POST", `/repos/${owner}/${name}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.json.object.sha });
  if (!created.ok) throw new Error(`create branch: ${created.status} ${JSON.stringify(created.json)}`);
  const filePath = `shipflow/${branch}.md`;
  const content = Buffer.from(`# ${task.title}\n\nImplementation for: ${feature.title}\n\n- adds a small change to exercise AI review\n`).toString("base64");
  const put = await api("PUT", `/repos/${owner}/${name}/contents/${filePath}`, { message: `feat: ${task.title}`, content, branch });
  if (!put.ok) throw new Error(`add file: ${put.status} ${JSON.stringify(put.json)}`);
  const pr = await api("POST", `/repos/${owner}/${name}/pulls`, {
    title: `${task.title}`, head: branch, base: repo.defaultBranch || "main",
    body: `Implements task for feature "${feature.title}".`,
  });
  if (!pr.ok) throw new Error(`open PR: ${pr.status} ${JSON.stringify(pr.json)}`);
  console.log(`Opened PR #${pr.json.number}: ${pr.json.html_url}`);

  // 3. Simulate the signed pull_request webhook.
  const payload = {
    action: "opened",
    number: pr.json.number,
    repository: { id: Number(repo.githubId), full_name: repo.fullName },
    pull_request: {
      id: pr.json.id, number: pr.json.number, title: pr.json.title,
      state: "open", merged: false,
      head: { ref: branch }, base: { ref: repo.defaultBranch || "main" },
    },
  };
  const raw = JSON.stringify(payload);
  const sig = signPayload(raw, decryptSecret(repo.webhookSecret));
  const wh = await fetch(`${BASE}/api/webhooks/github`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-github-event": "pull_request", "x-github-delivery": `demo-${Date.now()}`, "x-hub-signature-256": sig, "User-Agent": "GitHub-Hookshot/demo" },
    body: raw,
  });
  console.log(`Webhook → ${wh.status} ${await wh.text()}`);

  // 4. Poll for the feature reaching HUMAN_APPROVAL (review runs async via AI).
  console.log(`\nWaiting for PR processing + AI review (watch http://localhost:8288)...`);
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const f = await prisma.featureRequest.findUnique({ where: { id: feature.id }, select: { phase: true } });
    const reviews = await prisma.aIReview.count({ where: { pullRequest: { task: { featureRequestId: feature.id } } } });
    process.stdout.write(`  [${i}] phase=${f.phase} reviews=${reviews}\n`);
    if (f.phase === "HUMAN_APPROVAL") { console.log(`\n✓ Feature reached HUMAN_APPROVAL — it now appears in the Approval Queue.`); break; }
    if (f.phase === "FIX_NEEDED") { console.log(`\n✓ Feature went to FIX_NEEDED (AI found blocking issues) — visible on the feature + reviews.`); break; }
  }
} finally {
  await prisma.$disconnect();
}
