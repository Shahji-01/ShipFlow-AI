/**
 * Creates a small, genuinely-satisfiable feature + task, opens a PR that fully
 * implements it, runs the real AI review (which should pass with no blocking
 * issues), and lands the feature in the Approval Queue (HUMAN_APPROVAL).
 *
 *   node scripts/demo-approval-pass.mjs
 */
import { getPrisma, getConnectedRepo, decryptSecret, signPayload, gh } from "./_lib.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Small, self-contained features whose PRs genuinely satisfy the task so the
// AI review passes (no blocking issues) → feature reaches HUMAN_APPROVAL.
const PRESETS = {
  health: {
    title: "Add a health check API endpoint",
    description:
      'Expose a public GET /api/health endpoint returning HTTP 200 with JSON { status: "ok" } so uptime monitors and deploy checks can verify the app is running.',
    taskTitle: "Implement GET /api/health returning 200 and { status: 'ok' }",
    taskDescription:
      'Add a health check route handler at /api/health that responds with HTTP 200 and a JSON body { "status": "ok" }. Public (no auth), synchronous, no external calls.',
    acceptanceCriteria:
      '1) GET /api/health returns HTTP 200. 2) Body is JSON exactly { "status": "ok" }. 3) No auth required. 4) No external/DB calls.',
    filePath: "app/api/health/route.ts",
    file: `// Health check endpoint. GET /api/health -> 200 { status: "ok" }
// Public, synchronous, no external/database calls.
export function GET() {
  return Response.json({ status: "ok" }, { status: 200 });
}
`,
  },
  version: {
    title: "Add an app version endpoint",
    description:
      'Expose a public GET /api/version endpoint that returns HTTP 200 with JSON { version: string } sourced from the app version, so clients and monitors can read the deployed version.',
    taskTitle: "Implement GET /api/version returning 200 and { version }",
    taskDescription:
      'Add a route handler at /api/version returning HTTP 200 with JSON { "version": "<app version>" }. Public, synchronous, reads a constant/env, no DB calls.',
    acceptanceCriteria:
      '1) GET /api/version returns HTTP 200. 2) Body is JSON { "version": string }. 3) No auth required. 4) No external/DB calls.',
    filePath: "app/api/version/route.ts",
    file: `// Version endpoint. GET /api/version -> 200 { version }
// Public, synchronous, no external/database calls.
const APP_VERSION = process.env.APP_VERSION ?? "1.0.0";
export function GET() {
  return Response.json({ version: APP_VERSION }, { status: 200 });
}
`,
  },
  ping: {
    title: "Add a ping endpoint",
    description:
      'Expose a public GET /api/ping endpoint that returns HTTP 200 with the plain text "pong" for lightweight liveness checks.',
    taskTitle: "Implement GET /api/ping returning 200 'pong'",
    taskDescription:
      'Add a route handler at /api/ping returning HTTP 200 with the body "pong". Public, synchronous, no external calls.',
    acceptanceCriteria:
      '1) GET /api/ping returns HTTP 200. 2) Body is the text "pong". 3) No auth required. 4) No external/DB calls.',
    filePath: "app/api/ping/route.ts",
    file: `// Liveness endpoint. GET /api/ping -> 200 "pong"
// Public, synchronous, no external/database calls.
export function GET() {
  return new Response("pong", { status: 200 });
}
`,
  },
};

const presetKey = (() => {
  const i = process.argv.indexOf("--preset");
  return i !== -1 ? process.argv[i + 1] : "version";
})();
const preset = PRESETS[presetKey];
if (!preset) {
  console.error(`Unknown preset "${presetKey}". Options: ${Object.keys(PRESETS).join(", ")}`);
  process.exit(1);
}

const prisma = await getPrisma();
try {
  const { repo, githubToken } = await getConnectedRepo(prisma);
  if (!githubToken) throw new Error("No GitHub token for this workspace.");
  const [owner, name] = repo.fullName.split("/");
  const api = gh(githubToken);

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: repo.project.workspaceId },
    select: { userId: true },
  });
  if (!member) throw new Error("No workspace member found.");

  const branch = `shipflow-${presetKey}-${Date.now()}`;

  // 1. A small, self-contained feature + task in DEVELOPMENT, linked to the branch.
  const feature = await prisma.featureRequest.create({
    data: {
      projectId: repo.project.id,
      createdById: member.userId,
      title: preset.title,
      description: preset.description,
      source: "WEB",
      phase: "DEVELOPMENT",
    },
  });
  await prisma.task.create({
    data: {
      featureRequestId: feature.id,
      title: preset.taskTitle,
      description: preset.taskDescription,
      acceptanceCriteria: preset.acceptanceCriteria,
      status: "IN_PROGRESS",
      order: 0,
      linkedBranch: branch,
    },
  });
  console.log(`Created feature "${feature.title}" (DEVELOPMENT) with linked task → ${branch}`);

  // 2. Open a PR that fully implements the task.
  const ref = await api("GET", `/repos/${owner}/${name}/git/ref/heads/${repo.defaultBranch || "main"}`);
  if (!ref.ok) throw new Error(`base ref: ${ref.status}`);
  const created = await api("POST", `/repos/${owner}/${name}/git/refs`, { ref: `refs/heads/${branch}`, sha: ref.json.object.sha });
  if (!created.ok) throw new Error(`branch: ${created.status} ${JSON.stringify(created.json)}`);

  const put = await api("PUT", `/repos/${owner}/${name}/contents/${preset.filePath}`, {
    message: `feat: ${preset.taskTitle}`,
    content: Buffer.from(preset.file).toString("base64"),
    branch,
  });
  if (!put.ok) throw new Error(`file: ${put.status} ${JSON.stringify(put.json)}`);
  const pr = await api("POST", `/repos/${owner}/${name}/pulls`, {
    title: preset.title,
    head: branch,
    base: repo.defaultBranch || "main",
    body: `Implements: ${preset.taskTitle}`,
  });
  if (!pr.ok) throw new Error(`pr: ${pr.status} ${JSON.stringify(pr.json)}`);
  console.log(`Opened PR #${pr.json.number}: ${pr.json.html_url}`);

  // 3. Signed webhook → PR processing → review.
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
    headers: { "content-type": "application/json", "x-github-event": "pull_request", "x-github-delivery": `pass-${Date.now()}`, "x-hub-signature-256": sig, "User-Agent": "GitHub-Hookshot/demo" },
    body: raw,
  });
  console.log(`Webhook → ${wh.status} ${await wh.text()}`);

  console.log(`\nWaiting for AI review verdict (watch http://localhost:8288)...`);
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const f = await prisma.featureRequest.findUnique({ where: { id: feature.id }, select: { phase: true } });
    process.stdout.write(`  [${i}] phase=${f.phase}\n`);
    if (f.phase === "HUMAN_APPROVAL") { console.log(`\n✓ PASSED review → HUMAN_APPROVAL. It's now in the Approval Queue.`); break; }
    if (f.phase === "FIX_NEEDED") { console.log(`\n△ AI flagged blocking issues → FIX_NEEDED (see the review).`); break; }
  }
} finally {
  await prisma.$disconnect();
}
