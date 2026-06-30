// Shared helpers for local dev/test scripts (DB access, secret decryption).
import crypto from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Read a key from apps/web/.env (so scripts work without exported env). */
export function envFromWeb(key) {
  if (process.env[key]) return process.env[key];
  const txt = readFileSync(path.join(root, "apps/web/.env"), "utf8");
  const m = txt.match(new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m"));
  return m?.[1];
}

const ENCRYPTION_KEY = envFromWeb("ENCRYPTION_KEY");
function getKey() {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

/** Decrypt a secret produced by the app's encryptSecret (AES-256-GCM, v1:). */
export function decryptSecret(token) {
  if (!token?.startsWith("v1:")) return token;
  const [, iv, tag, data] = token.split(":");
  const d = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** HMAC-SHA256 signature in GitHub's `sha256=...` header format. */
export function signPayload(rawBody, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export async function getPrisma() {
  const mod = await import(pathToFileURL(path.join(root, "packages/database/dist/index.js")).href);
  return mod.default;
}

/** Load the single connected repository + its workspace's GitHub token. */
export async function getConnectedRepo(prisma) {
  const repo = await prisma.repository.findFirst({
    select: {
      id: true, githubId: true, fullName: true, webhookSecret: true, defaultBranch: true,
      project: { select: { id: true, name: true, workspaceId: true } },
    },
    orderBy: { connectedAt: "desc" },
  });
  if (!repo) throw new Error("No connected repository found. Connect one in the GitHub page first.");

  const acct = await prisma.account.findFirst({
    where: { provider: "github", user: { workspaceMembers: { some: { workspaceId: repo.project.workspaceId } } } },
    select: { accessToken: true },
  });
  const githubToken = acct?.accessToken ? decryptSecret(acct.accessToken) : null;
  return { repo, githubToken };
}

export const gh = (token) => async (method, urlPath, body) => {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "shipflow-scripts",
      Accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
};
