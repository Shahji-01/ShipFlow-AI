import crypto from "crypto";

/**
 * AES-256-GCM encryption for secrets at rest (GitHub tokens, webhook secrets,
 * Slack webhook URLs).
 *
 * Lives in the inngest package (which only depends on the database) so it can
 * be shared by both Inngest workflow functions and the API layer without a
 * circular dependency. The API package re-exports these for convenience.
 *
 * Stored format:  v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required (min 16 chars) for encrypting secrets at rest."
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Encrypt a plaintext string. Returns a self-describing token string. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a token string produced by encryptSecret.
 * Falls back to returning the input unchanged if it isn't in the versioned
 * format (supports legacy plaintext rows during migration).
 */
export function decryptSecret(token: string): string {
  if (!token.startsWith(`${VERSION}:`)) {
    return token;
  }

  const parts = token.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted secret.");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Whether a value appears to already be encrypted by this module. */
export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(`${VERSION}:`);
}
