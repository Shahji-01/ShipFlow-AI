import crypto from "crypto";
import { Octokit } from "octokit";

/**
 * Creates an authenticated Octokit instance for GitHub API operations.
 * @param token - GitHub OAuth access token
 */
export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Registers a webhook on a GitHub repository for the specified events.
 * @returns The created webhook's ID
 */
export async function createWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string
): Promise<{ webhookId: number }> {
  const response = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret,
      insecure_ssl: "0",
    },
    events: ["push", "pull_request", "pull_request_review"],
    active: true,
  });

  return { webhookId: response.data.id };
}

/**
 * Deletes a webhook from a GitHub repository.
 */
export async function deleteWebhook(
  octokit: Octokit,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  await octokit.rest.repos.deleteWebhook({
    owner,
    repo,
    hook_id: hookId,
  });
}

/**
 * Fetches pull request details from GitHub.
 */
export async function fetchPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return response.data;
}

/**
 * Fetches the changed files for a pull request and computes a diff summary.
 * Returns an array of file changes with path, additions, and deletions.
 */
export async function fetchDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ files: Array<{ path: string; additions: number; deletions: number }> }> {
  const response = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const files = response.data.map((file) => ({
    path: file.filename,
    additions: file.additions,
    deletions: file.deletions,
  }));

  return { files };
}

/**
 * Lists repositories accessible by the authenticated user.
 */
export async function listUserRepos(octokit: Octokit) {
  const response = await octokit.rest.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: "updated",
    direction: "desc",
  });

  return response.data.map((repo) => ({
    id: repo.id,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
    description: repo.description,
  }));
}

/**
 * Lists pull requests for a given repository.
 */
export async function listRepoPullRequests(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all"
) {
  const response = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    per_page: 50,
    sort: "updated",
    direction: "desc",
  });

  return response.data;
}

/**
 * Generates a random webhook secret.
 */
export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Verifies a GitHub webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body as a string
 * @param signature - The signature from the X-Hub-Signature-256 header
 * @param secret - The webhook secret stored for the repository
 * @returns true if the signature is valid, false otherwise
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature =
    "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");

  // Ensure both buffers are the same length for timingSafeEqual
  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}
