import { describe, it, expect } from "vitest";
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  canAccess,
  WorkspaceRole,
} from "./permissions";

describe("permissions", () => {
  describe("ROLE_PERMISSIONS", () => {
    it("defines permissions for all WorkspaceRole values", () => {
      expect(ROLE_PERMISSIONS[WorkspaceRole.ADMIN]).toBeDefined();
      expect(ROLE_PERMISSIONS[WorkspaceRole.MEMBER]).toBeDefined();
      expect(ROLE_PERMISSIONS[WorkspaceRole.APPROVER]).toBeDefined();
    });

    it("ADMIN has all MEMBER permissions plus admin-specific ones", () => {
      const adminPerms = ROLE_PERMISSIONS[WorkspaceRole.ADMIN];
      const memberPerms = ROLE_PERMISSIONS[WorkspaceRole.MEMBER];

      // Admin should have every permission that Member has
      for (const perm of memberPerms) {
        expect(adminPerms.has(perm)).toBe(true);
      }

      // Admin should also have admin-specific permissions
      expect(adminPerms.has(Permission.MANAGE_MEMBERS)).toBe(true);
      expect(adminPerms.has(Permission.MANAGE_ROLES)).toBe(true);
      expect(adminPerms.has(Permission.MANAGE_BILLING)).toBe(true);
      expect(adminPerms.has(Permission.MANAGE_WORKSPACE_SETTINGS)).toBe(true);
    });

    it("MEMBER cannot manage workspace settings or billing", () => {
      const memberPerms = ROLE_PERMISSIONS[WorkspaceRole.MEMBER];

      expect(memberPerms.has(Permission.MANAGE_MEMBERS)).toBe(false);
      expect(memberPerms.has(Permission.MANAGE_ROLES)).toBe(false);
      expect(memberPerms.has(Permission.MANAGE_BILLING)).toBe(false);
      expect(memberPerms.has(Permission.MANAGE_WORKSPACE_SETTINGS)).toBe(false);
    });

    it("MEMBER can create and edit projects, tasks, and feature requests", () => {
      const memberPerms = ROLE_PERMISSIONS[WorkspaceRole.MEMBER];

      expect(memberPerms.has(Permission.CREATE_PROJECT)).toBe(true);
      expect(memberPerms.has(Permission.EDIT_PROJECT)).toBe(true);
      expect(memberPerms.has(Permission.CREATE_TASK)).toBe(true);
      expect(memberPerms.has(Permission.EDIT_TASK)).toBe(true);
      expect(memberPerms.has(Permission.CREATE_FEATURE_REQUEST)).toBe(true);
      expect(memberPerms.has(Permission.EDIT_FEATURE_REQUEST)).toBe(true);
      expect(memberPerms.has(Permission.VIEW_WORKSPACE_DATA)).toBe(true);
    });

    it("APPROVER can approve/reject PRDs and releases", () => {
      const approverPerms = ROLE_PERMISSIONS[WorkspaceRole.APPROVER];

      expect(approverPerms.has(Permission.APPROVE_PRD)).toBe(true);
      expect(approverPerms.has(Permission.REJECT_PRD)).toBe(true);
      expect(approverPerms.has(Permission.APPROVE_RELEASE)).toBe(true);
      expect(approverPerms.has(Permission.REJECT_RELEASE)).toBe(true);
      expect(approverPerms.has(Permission.VIEW_WORKSPACE_DATA)).toBe(true);
    });

    it("APPROVER cannot modify workspace settings or billing", () => {
      const approverPerms = ROLE_PERMISSIONS[WorkspaceRole.APPROVER];

      expect(approverPerms.has(Permission.MANAGE_MEMBERS)).toBe(false);
      expect(approverPerms.has(Permission.MANAGE_ROLES)).toBe(false);
      expect(approverPerms.has(Permission.MANAGE_BILLING)).toBe(false);
      expect(approverPerms.has(Permission.MANAGE_WORKSPACE_SETTINGS)).toBe(false);
    });
  });

  describe("hasPermission", () => {
    it("returns true when the role has the permission", () => {
      expect(hasPermission(WorkspaceRole.ADMIN, Permission.MANAGE_BILLING)).toBe(true);
      expect(hasPermission(WorkspaceRole.MEMBER, Permission.CREATE_PROJECT)).toBe(true);
      expect(hasPermission(WorkspaceRole.APPROVER, Permission.APPROVE_RELEASE)).toBe(true);
    });

    it("returns false when the role lacks the permission", () => {
      expect(hasPermission(WorkspaceRole.MEMBER, Permission.MANAGE_BILLING)).toBe(false);
      expect(hasPermission(WorkspaceRole.APPROVER, Permission.MANAGE_WORKSPACE_SETTINGS)).toBe(false);
      expect(hasPermission(WorkspaceRole.MEMBER, Permission.APPROVE_RELEASE)).toBe(false);
    });

    it("ADMIN has permission for member-level actions", () => {
      expect(hasPermission(WorkspaceRole.ADMIN, Permission.CREATE_PROJECT)).toBe(true);
      expect(hasPermission(WorkspaceRole.ADMIN, Permission.EDIT_TASK)).toBe(true);
      expect(hasPermission(WorkspaceRole.ADMIN, Permission.VIEW_WORKSPACE_DATA)).toBe(true);
    });
  });

  describe("canAccess", () => {
    it("returns true when user role is in the required roles", () => {
      expect(canAccess(WorkspaceRole.ADMIN, [WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])).toBe(true);
      expect(canAccess(WorkspaceRole.APPROVER, [WorkspaceRole.APPROVER])).toBe(true);
    });

    it("returns false when user role is not in the required roles", () => {
      expect(canAccess(WorkspaceRole.MEMBER, [WorkspaceRole.ADMIN])).toBe(false);
      expect(canAccess(WorkspaceRole.APPROVER, [WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])).toBe(false);
    });

    it("returns false for an empty required roles array", () => {
      expect(canAccess(WorkspaceRole.ADMIN, [])).toBe(false);
    });
  });
});
