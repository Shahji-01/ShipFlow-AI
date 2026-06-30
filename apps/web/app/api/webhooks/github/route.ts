import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@shipflow/database";
import { inngest } from "@shipflow/inngest";
import {
  decryptSecret,
  rateLimitAsync,
  getClientIp,
  logger,
  claimWebhookEvent,
} from "@shipflow/api";

/**
 * Verifies a GitHub webhook signature using HMAC-SHA256.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * GitHub Webhook Receiver (POST /api/webhooks/github)
 *
 * Receives webhook events from GitHub, validates the HMAC-SHA256 signature
 * against the stored webhook secret, and queues valid events to Inngest
 * for asynchronous processing.
 *
 * Requirements: 4.2, 4.7
 * - Validates HMAC-SHA256 signature against stored webhook secret
 * - Rejects invalid signatures with 401, logs, doesn't process
 * - Queues valid events to Inngest for async processing
 */
export async function POST(req: Request): Promise<Response> {
  try {
    // Rate limit by client IP to blunt abuse / replay floods.
    const ip = getClientIp(req.headers);
    const rl = await rateLimitAsync(`webhook:github:${ip}`, 120, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // Read the raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256") ?? "";
    const eventType = req.headers.get("x-github-event") ?? "";
    const deliveryId = req.headers.get("x-github-delivery") ?? "";

    if (!signature) {
      logger.warn("GitHub webhook missing signature header", { deliveryId });
      return NextResponse.json(
        { error: "Missing signature" },
        { status: 401 }
      );
    }

    if (!rawBody) {
      logger.warn("GitHub webhook empty payload", { deliveryId });
      return NextResponse.json(
        { error: "Empty payload" },
        { status: 400 }
      );
    }

    // Parse the payload to extract repository information
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn("GitHub webhook invalid JSON payload", { deliveryId });
      return NextResponse.json(
        { error: "Invalid JSON" },
        { status: 400 }
      );
    }

    // Extract the repository GitHub ID to find the matching stored secret
    const repository = payload.repository as
      | { id?: number; full_name?: string }
      | undefined;

    if (!repository?.id) {
      logger.warn("GitHub webhook missing repository info", { deliveryId });
      return NextResponse.json(
        { error: "Missing repository information" },
        { status: 400 }
      );
    }

    // Look up the repository record to get the webhook secret
    const repoRecord = await prisma.repository.findUnique({
      where: { githubId: BigInt(repository.id) },
      select: {
        id: true,
        webhookSecret: true,
        projectId: true,
        project: {
          select: { workspaceId: true },
        },
      },
    });

    if (!repoRecord || !repoRecord.webhookSecret) {
      logger.warn("GitHub webhook: no matching repository", {
        githubId: repository.id,
        deliveryId,
      });
      return NextResponse.json(
        { error: "Repository not found" },
        { status: 401 }
      );
    }

    // Validate HMAC-SHA256 signature (Requirement 4.7).
    // The stored secret is encrypted at rest — decrypt before comparing.
    const webhookSecret = decryptSecret(repoRecord.webhookSecret);
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      logger.warn("GitHub webhook invalid signature", {
        repo: repository.full_name,
        deliveryId,
      });
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Idempotency: ignore redelivered/duplicate events (GitHub retries on
    // timeout). Keyed on the X-GitHub-Delivery id.
    const isFirstDelivery = await claimWebhookEvent(
      prisma,
      "github",
      deliveryId,
      eventType
    );
    if (!isFirstDelivery) {
      logger.info("GitHub webhook duplicate delivery ignored", { deliveryId });
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    // Signature is valid - queue event to Inngest for async processing (Requirement 4.2)
    await inngest.send({
      name: "webhook/process",
      data: {
        provider: "github",
        eventType,
        payload,
        repositoryId: repoRecord.id,
        workspaceId: repoRecord.project.workspaceId,
        deliveryId,
      },
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error("GitHub webhook unexpected error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
