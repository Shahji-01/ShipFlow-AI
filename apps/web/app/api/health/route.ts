import { NextResponse } from "next/server";
import prisma from "@shipflow/database";

/**
 * Health check endpoint for uptime monitors and deploy verification.
 *
 * GET /api/health -> 200 { status: "ok", db: "up" } when the database is
 * reachable, 503 otherwise. Kept dependency-light and uncached.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "up", timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { status: "error", db: "down", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
