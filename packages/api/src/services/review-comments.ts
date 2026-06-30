import { Octokit } from "octokit";
import { type IssueCategory } from "@shipflow/database";

/**
 * A review issue to be posted as a GitHub comment.
 */
export interface ReviewIssueComment {
  category: IssueCategory;
  filePath: string;
  lineNumber: number | null;
  title: string;
  description: string;
}

/**
 * Posts inline comments on a GitHub pull request for each identified issue.
 * Each issue becomes one inline comment with its category and description.
 *
 * Requirement: 5.7 - Post one inline comment per identified issue indicating
 * its category and description.
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param commitSha - The HEAD commit SHA of the PR (for review comments)
 * @param issues - Array of review issues to post
 */
export async function postReviewComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  commitSha: string,
  issues: ReviewIssueComment[]
): Promise<void> {
  // Build review comments for issues that have line numbers
  const comments = issues
    .filter((issue) => issue.lineNumber !== null)
    .map((issue) => ({
      path: issue.filePath,
      line: issue.lineNumber as number,
      body: formatIssueComment(issue),
    }));

  // Post issues with line numbers as a PR review with inline comments
  if (comments.length > 0) {
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      event: "COMMENT",
      comments,
    });
  }

  // Post issues without line numbers as individual PR comments
  const generalIssues = issues.filter((issue) => issue.lineNumber === null);
  for (const issue of generalIssues) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: formatIssueComment(issue),
    });
  }
}

/**
 * Posts a summary comment on a GitHub pull request with the review results.
 * Shows a breakdown of blocking vs non-blocking issues.
 *
 * Requirement: 5.7 - Post summary comment with blocking/non-blocking breakdown.
 *
 * @param octokit - Authenticated Octokit instance
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param iteration - Current review iteration number
 * @param issues - Array of review issues
 * @param summary - AI-generated review summary
 */
export async function postReviewSummary(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  iteration: number,
  issues: ReviewIssueComment[],
  summary: string
): Promise<void> {
  const blockingCount = issues.filter((i) => i.category === "BLOCKING").length;
  const nonBlockingCount = issues.filter(
    (i) => i.category === "NON_BLOCKING"
  ).length;

  const statusEmoji = blockingCount > 0 ? "🚫" : "✅";
  const statusText =
    blockingCount > 0
      ? "**Changes Requested** — Blocking issues found"
      : "**Approved** — No blocking issues found";

  const body = `## ${statusEmoji} ShipFlow AI Review — Iteration ${iteration}

${statusText}

### Summary
${summary}

### Issue Breakdown
| Category | Count |
|----------|-------|
| 🚫 Blocking | ${blockingCount} |
| 💡 Non-blocking | ${nonBlockingCount} |
| **Total** | **${issues.length}** |

${blockingCount > 0 ? `### Blocking Issues\n${issues.filter((i) => i.category === "BLOCKING").map((i) => `- **${i.title}** (\`${i.filePath}\`${i.lineNumber ? `:${i.lineNumber}` : ""}): ${i.description}`).join("\n")}` : ""}

${nonBlockingCount > 0 ? `### Non-blocking Suggestions\n${issues.filter((i) => i.category === "NON_BLOCKING").map((i) => `- **${i.title}** (\`${i.filePath}\`${i.lineNumber ? `:${i.lineNumber}` : ""}): ${i.description}`).join("\n")}` : ""}

---
*Powered by ShipFlow AI QA Agent*`;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}

/**
 * Formats a single issue into a GitHub comment body.
 */
function formatIssueComment(issue: ReviewIssueComment): string {
  const categoryLabel =
    issue.category === "BLOCKING" ? "🚫 BLOCKING" : "💡 NON-BLOCKING";

  return `**[${categoryLabel}] ${issue.title}**

${issue.description}`;
}
