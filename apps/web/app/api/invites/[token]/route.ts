import prisma from "@shipflow/database";

/**
 * GET /api/invites/[token]
 *
 * Returns public-facing details for a workspace invitation so the accept page
 * can render who invited the user, to which workspace, and with what role.
 *
 * The "token" in the URL is the WorkspaceInvitation id (that's what the invite
 * email links to). Returns 404 for unknown, already-handled, or expired
 * invitations so the UI shows a single "invalid or expired" state.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: token },
    include: {
      workspace: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  });

  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.declinedAt ||
    new Date() > invitation.expiresAt
  ) {
    return Response.json(
      { message: "This invitation is invalid or has expired." },
      { status: 404 }
    );
  }

  return Response.json({
    workspaceName: invitation.workspace?.name ?? "a workspace",
    inviterName:
      invitation.invitedBy?.name ||
      invitation.invitedBy?.email ||
      "A teammate",
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  });
}
