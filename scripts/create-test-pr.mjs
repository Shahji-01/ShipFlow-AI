/**
 * Creates a throwaway pull request in the connected GitHub repo so the local
 * AI-review loop can be exercised end-to-end. Everything it creates (a branch,
 * one markdown file, one PR) is easy to delete afterwards.
 *
 *   node scripts/create-test-pr.mjs
 */
import { getPrisma, getConnectedRepo, gh } from "./_lib.mjs";

const prisma = await getPrisma();
try {
  const { repo, githubToken } = await getConnectedRepo(prisma);
  if (!githubToken) throw new Error("No GitHub token for this workspace. Reconnect GitHub in Settings.");

  const [owner, name] = repo.fullName.split("/");
  const api = gh(githubToken);
  const base = repo.defaultBranch || "main";
  const branch = `shipflow-test-${Date.now()}`;
  console.log(`Repo: ${repo.fullName}  base: ${base}  new branch: ${branch}`);

  // 1. Latest commit sha on the base branch
  const ref = await api("GET", `/repos/${owner}/${name}/git/ref/heads/${base}`);
  if (!ref.ok) throw new Error(`Couldn't read base ref: ${ref.status} ${JSON.stringify(ref.json)}`);
  const sha = ref.json.object.sha;

  // 2. Create the new branch
  const created = await api("POST", `/repos/${owner}/${name}/git/refs`, { ref: `refs/heads/${branch}`, sha });
  if (!created.ok) throw new Error(`Couldn't create branch: ${created.status} ${JSON.stringify(created.json)}`);

  // 3. Add a file on the branch (this creates a commit + diff to review)
  const filePath = `shipflow-test/${branch}.md`;
  const content = Buffer.from(
    `# ShipFlow test change\n\nThis file was added by scripts/create-test-pr.mjs to exercise the AI review loop.\n\n` +
    `- Intentional nit: no input validation on a hypothetical handler.\n- TODO: remove this file.\n`
  ).toString("base64");
  const put = await api("PUT", `/repos/${owner}/${name}/contents/${filePath}`, {
    message: "test: add shipflow review sample", content, branch,
  });
  if (!put.ok) throw new Error(`Couldn't add file: ${put.status} ${JSON.stringify(put.json)}`);

  // 4. Open the PR
  const pr = await api("POST", `/repos/${owner}/${name}/pulls`, {
    title: "Test: ShipFlow AI review sample", head: branch, base,
    body: "Throwaway PR to test the ShipFlow AI review loop locally.",
  });
  if (!pr.ok) throw new Error(`Couldn't open PR: ${pr.status} ${JSON.stringify(pr.json)}`);

  console.log(`\n✓ Opened PR #${pr.json.number} (id ${pr.json.id})`);
  console.log(`  ${pr.json.html_url}`);
  console.log(`  head branch: ${branch}`);
  console.log(`\nNext: sync it into ShipFlow with`);
  console.log(`  node scripts/simulate-github-webhook.mjs`);
} finally {
  await prisma.$disconnect();
}
