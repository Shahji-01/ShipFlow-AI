import prisma from "@shipflow/database";
import { auth } from "@shipflow/auth/server";

/** Mirror of the workspace router's membership cap. */
const MAX_MEMBERSHIPS_PER_USER = 20;

/**
 * POST /api/invites/[token]/accept
 *
 * Accepts a workspace invitation for the signed-in user. The "token" is the
 * WorkspaceInvitation id. Validates ownership (email match), state, and expiry,
 * then atomically marks the invitation accepted and creates the membership.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json(
      { message: "You must be signed in to accept an invitation." },
      { status: 401 }
    );
  }

  const { token } = await params;

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { id: token },
  });

  if (!invitation) {
    return Response.json(
      { message: "This invitation is invalid or has expired." },
      { status: 404 }
    );
  }

  if (invitation.email !== session.user.email) {
    return Response.json(
      { message: "This invitation is not for your account." },
      { status: 403 }
    );
  }

  if (invitation.acceptedAt) {
    return Response.json(
      { message: "This invitation has already been accepted." },
      { status: 400 }
    );
  }

  if (invitation.declinedAt) {
    return Response.json(
      { message: "This invitation has already been declined." },
      { status: 400 }
    );
  }

  if (new Date() > invitation.expiresAt) {
    return Response.json(
      { message: "This invitation has expired." },
      { status: 400 }
    );
  }

  // Already a member? Treat as success (idempotent) so the UI can proceed.
  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: invitation.workspaceId, userId: session.user.id },
  });
  if (existingMember) {
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    return Response.json({ success: true, workspaceId: invitation.workspaceId });
  }

  const membershipCount = await prisma.workspaceMember.count({
    where: { userId: session.user.id },
  });
  if (membershipCount >= MAX_MEMBERSHIPS_PER_USER) {
    return Response.json(
      {
        message: `You have reached the maximum limit of ${MAX_MEMBERSHIPS_PER_USER} workspace memberships.`,
      },
      { status: 403 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await tx.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: session.user.id,
        role: invitation.role,
      },
    });
  });

  return Response.json({ success: true, workspaceId: invitation.workspaceId });
}
