/**
 * Simulates a real GitHub `pull_request` webhook delivery to the local app —
 * properly HMAC-SHA256 signed with the connected repo's stored webhook secret.
 * This exercises the exact production path:
 *   POST /api/webhooks/github → signature verify → Inngest pr-processing → (AI review)
 * without needing a public tunnel or GitHub to reach localhost.
 *
 *   node scripts/simulate-github-webhook.mjs            # uses latest open PR
 *   node scripts/simulate-github-webhook.mjs --pr 7     # specific PR number
 *
 * Env: BASE_URL (default http://localhost:3000)
 */
import { getPrisma, getConnectedRepo, decryptSecret, signPayload, gh } from "./_lib.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prArg = (() => {
  const i = process.argv.indexOf("--pr");
  return i !== -1 ? Number(process.argv[i + 1]) : null;
})();

const prisma = await getPrisma();
try {
  const { repo, githubToken } = await getConnectedRepo(prisma);
  const secret = decryptSecret(repo.webhookSecret);
  if (!secret) throw new Error("Repository has no stored webhook secret.");
  const [owner, name] = repo.fullName.split("/");

  // Resolve a real PR to reference (so diff-fetch + review work).
  let pr;
  if (githubToken) {
    const api = gh(githubToken);
    if (prArg) {
      const r = await api("GET", `/repos/${owner}/${name}/pulls/${prArg}`);
      if (!r.ok) throw new Error(`PR #${prArg} not found: ${r.status}`);
      pr = r.json;
    } else {
      const r = await api("GET", `/repos/${owner}/${name}/pulls?state=open&per_page=1&sort=created&direction=desc`);
      if (!r.ok) throw new Error(`Couldn't list PRs: ${r.status}`);
      pr = r.json[0];
    }
  }
  if (!pr) {
    throw new Error(
      "No open PR found to simulate. Create one first:\n  node scripts/create-test-pr.mjs"
    );
  }

  // Build a GitHub-shaped pull_request webhook payload.
  const payload = {
    action: "opened",
    number: pr.number,
    repository: { id: Number(repo.githubId), full_name: repo.fullName },
    pull_request: {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      merged: !!pr.merged_at,
      head: { ref: pr.head.ref },
      base: { ref: pr.base.ref },
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = signPayload(rawBody, secret);

  console.log(`Simulating pull_request:opened for ${repo.fullName} PR #${pr.number} (id ${pr.id})`);
  const res = await fetch(`${BASE}/api/webhooks/github`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": `sim-${Date.now()}`,
      "x-hub-signature-256": signature,
      "User-Agent": "GitHub-Hookshot/sim",
    },
    body: rawBody,
  });
  const body = await res.text();
  console.log(`\n→ ${BASE}/api/webhooks/github responded ${res.status}: ${body}`);
  if (res.ok) {
    console.log(`\n✓ Webhook accepted and queued to Inngest.`);
    console.log(`  Watch processing at http://localhost:8288 (PR Processing → AI Review).`);
    console.log(`  Then open the PR under Reviews in the app.`);
  } else {
    console.log(`\n✗ Webhook rejected. Check the dev server logs.`);
  }
} finally {
  await prisma.$disconnect();
}
