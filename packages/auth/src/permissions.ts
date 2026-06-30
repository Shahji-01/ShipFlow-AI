import { WorkspaceRole } from "@shipflow/database";

/**
 * Permissions that can be checked against a user's workspace role.
 * These map to specific actions within the ShipFlow platform.
 */
export const Permission = {
  // Admin-level permissions
  MANAGE_MEMBERS: "MANAGE_MEMBERS",
  MANAGE_ROLES: "MANAGE_ROLES",
  MANAGE_BILLING: "MANAGE_BILLING",
  MANAGE_WORKSPACE_SETTINGS: "MANAGE_WORKSPACE_SETTINGS",

  // Member-level permissions
  CREATE_PROJECT: "CREATE_PROJECT",
  EDIT_PROJECT: "EDIT_PROJECT",
  CREATE_TASK: "CREATE_TASK",
  EDIT_TASK: "EDIT_TASK",
  CREATE_FEATURE_REQUEST: "CREATE_FEATURE_REQUEST",
  EDIT_FEATURE_REQUEST: "EDIT_FEATURE_REQUEST",
  VIEW_WORKSPACE_DATA: "VIEW_WORKSPACE_DATA",

  // Approver-level permissions
  APPROVE_PRD: "APPROVE_PRD",
  REJECT_PRD: "REJECT_PRD",
  APPROVE_RELEASE: "APPROVE_RELEASE",
  REJECT_RELEASE: "REJECT_RELEASE",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/**
 * Maps each workspace role to its set of allowed permissions.
 *
 * Permission hierarchy:
 * - ADMIN: All Member permissions + manage members, roles, billing, workspace settings
 * - MEMBER: Create/edit projects, tasks, feature requests, view all workspace data
 * - APPROVER: Approve/reject PRDs and releases, view all workspace data
 *   (cannot modify workspace settings or billing)
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  [WorkspaceRole.ADMIN]: new Set<Permission>([
    // Admin-specific
    Permission.MANAGE_MEMBERS,
    Permission.MANAGE_ROLES,
    Permission.MANAGE_BILLING,
    Permission.MANAGE_WORKSPACE_SETTINGS,
    // Inherits all Member permissions
    Permission.CREATE_PROJECT,
    Permission.EDIT_PROJECT,
    Permission.CREATE_TASK,
    Permission.EDIT_TASK,
    Permission.CREATE_FEATURE_REQUEST,
    Permission.EDIT_FEATURE_REQUEST,
    Permission.VIEW_WORKSPACE_DATA,
    // Admins are workspace owners and can also approve/reject PRDs and releases
    Permission.APPROVE_PRD,
    Permission.REJECT_PRD,
    Permission.APPROVE_RELEASE,
    Permission.REJECT_RELEASE,
  ]),

  [WorkspaceRole.MEMBER]: new Set<Permission>([
    Permission.CREATE_PROJECT,
    Permission.EDIT_PROJECT,
    Permission.CREATE_TASK,
    Permission.EDIT_TASK,
    Permission.CREATE_FEATURE_REQUEST,
    Permission.EDIT_FEATURE_REQUEST,
    Permission.VIEW_WORKSPACE_DATA,
  ]),

  [WorkspaceRole.APPROVER]: new Set<Permission>([
    Permission.APPROVE_PRD,
    Permission.REJECT_PRD,
    Permission.APPROVE_RELEASE,
    Permission.REJECT_RELEASE,
    Permission.VIEW_WORKSPACE_DATA,
  ]),
};

/**
 * Checks if a user with the given role has a specific permission.
 *
 * @param userRole - The user's role within the workspace
 * @param permission - The permission to check
 * @returns true if the role grants the specified permission
 *
 * @example
 * ```ts
 * import { hasPermission, Permission } from "@shipflow/auth";
 * import { WorkspaceRole } from "@shipflow/database";
 *
 * if (hasPermission(member.role, Permission.MANAGE_BILLING)) {
 *   // Allow billing management
 * }
 * ```
 */
export function hasPermission(
  userRole: WorkspaceRole,
  permission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[userRole];
  return permissions.has(permission);
}

/**
 * Checks if a user's role is included in a list of required roles.
 * Useful for tRPC middleware when a procedure should be accessible
 * to multiple specific roles.
 *
 * @param userRole - The user's role within the workspace
 * @param requiredRoles - Array of roles that are allowed access
 * @returns true if the user's role is in the required roles list
 *
 * @example
 * ```ts
 * import { canAccess } from "@shipflow/auth";
 * import { WorkspaceRole } from "@shipflow/database";
 *
 * // Only Admins and Approvers can approve releases
 * if (canAccess(member.role, [WorkspaceRole.ADMIN, WorkspaceRole.APPROVER])) {
 *   // Allow the action
 * }
 * ```
 */
export function canAccess(
  userRole: WorkspaceRole,
  requiredRoles: WorkspaceRole[]
): boolean {
  return requiredRoles.includes(userRole);
}

// Re-export WorkspaceRole for convenience
export { WorkspaceRole };
