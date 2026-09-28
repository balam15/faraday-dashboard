"use client";

import { useMemo, useState } from "react";
import {
  useRoles,
  useMe,
  createRole,
  deleteRole,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, Trash2, Shield, Eye, Upload, Settings } from "lucide-react";

interface Permission {
  id: string;
  label: string;
  description: string;
}

interface RoleCard {
  id: string;
  name: string;
  rawName?: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
}

const allPermissions: Permission[] = [
  { id: "view_dashboard", label: "View Dashboard", description: "Access the main dashboard" },
  { id: "view_applications", label: "View Applications", description: "See all applications and their scan results" },
  { id: "view_findings", label: "View Findings", description: "View security findings" },
  { id: "import_scans", label: "Import Scans", description: "Upload and import scan result files" },
  { id: "manage_findings", label: "Manage Findings", description: "Update finding status (mitigate, accept, etc.)" },
  { id: "manage_applications", label: "Manage Applications", description: "Create, edit, delete applications" },
  { id: "manage_users", label: "Manage Users", description: "Invite and manage user access" },
  { id: "manage_roles", label: "Manage Roles", description: "Create and edit roles" },
  { id: "manage_settings", label: "Manage Settings", description: "Change system settings including LDAP" },
];

const ROLE_DISPLAY: Record<string, string> = {
  admin: "Admin",
  security_engineer: "Security Engineer",
  developer: "Developer",
  viewer: "Viewer",
};

function toDisplayRole(role: string): string {
  const key = role.toLowerCase().replace(/\s+/g, "_");
  if (ROLE_DISPLAY[key]) return ROLE_DISPLAY[key];
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const permissionIcons: Record<string, typeof Eye> = {
  view_dashboard: Eye,
  view_applications: Eye,
  view_findings: Eye,
  import_scans: Upload,
  manage_findings: Shield,
  manage_applications: Settings,
  manage_users: Users,
  manage_roles: Users,
  manage_settings: Settings,
};

export function ManageRolesSection() {
  const { roles: apiRoles, reload: reloadRoles } = useRoles();
  const { me } = useMe();
  const canManageRoles = !!me?.permissions.includes("manage_roles");
  const { confirm, ConfirmModal } = useConfirm();

  const [selectedRole, setSelectedRole] = useState<RoleCard | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);

  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState<{ name: string; description: string; permissions: string[] }>({
    name: "",
    description: "",
    permissions: ["view_dashboard", "view_findings"],
  });
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState("");

  const roleCards: RoleCard[] = useMemo(
    () =>
      apiRoles.map((r) => ({
        id: r.name,
        name: toDisplayRole(r.name),
        rawName: r.name,
        description: r.description,
        permissions: r.permissions,
        userCount: r.user_count,
        isSystem: r.is_system,
      })),
    [apiRoles],
  );

  function toggleRolePerm(id: string) {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(id)
        ? f.permissions.filter((p) => p !== id)
        : [...f.permissions, id],
    }));
  }

  async function handleCreateRole() {
    if (roleForm.name.trim().length < 2) {
      setRoleError("Role name must be at least 2 characters.");
      return;
    }
    setSavingRole(true);
    setRoleError("");
    try {
      await createRole({
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        permissions: roleForm.permissions,
      });
      setAddRoleOpen(false);
      setRoleForm({ name: "", description: "", permissions: ["view_dashboard", "view_findings"] });
      reloadRoles();
    } catch (e) {
      setRoleError(e instanceof Error ? e.message : "Failed to create role");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleDeleteRole(rawName: string, label?: string) {
    const ok = await confirm({
      title: "Delete role?",
      message: `Role "${label ?? rawName}" will be deleted.`,
      confirmLabel: "Delete role",
    });
    if (!ok) return;
    try {
      await deleteRole(rawName);
      setSelectedRole(null);
      setRoleDialogOpen(false);
      reloadRoles();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete role");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {roleCards.length} roles · {roleCards.filter((r) => !r.isSystem).length} custom
        </p>
        {canManageRoles && (
          <button
            onClick={() => setAddRoleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Role
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {roleCards.map((role) => (
          <Card
            key={role.id}
            className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => {
              setSelectedRole(role);
              setRoleDialogOpen(true);
            }}
          >
            <CardHeader className="pb-3 px-5 pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold text-slate-800">
                      {role.name}
                    </CardTitle>
                    {role.isSystem && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-500">
                        system
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{role.description}</p>
                </div>
                {!role.isSystem && canManageRoles && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRole(role.rawName ?? role.id, role.name);
                      }}
                      className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete role"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-500">
                  {role.permissions.length} permissions
                </span>
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-3 w-3" />
                  {role.userCount} users
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 4).map((p) => {
                  const perm = allPermissions.find((ap) => ap.id === p);
                  return perm ? (
                    <span
                      key={p}
                      className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                    >
                      {perm.label}
                    </span>
                  ) : null;
                })}
                {role.permissions.length > 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">
                    +{role.permissions.length - 4} more
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role detail dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRole?.name}
              {selectedRole?.isSystem && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200 text-slate-500 font-normal">
                  system
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedRole && (
            <div className="space-y-4 mt-2">
              <p className="text-sm text-slate-500">{selectedRole.description}</p>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Permissions
                </p>
                <div className="space-y-2">
                  {allPermissions.map((perm) => {
                    const Icon = permissionIcons[perm.id] || Shield;
                    const hasPermission = selectedRole.permissions.includes(perm.id);
                    return (
                      <div
                        key={perm.id}
                        className={`flex items-center gap-3 p-2.5 rounded-lg ${
                          hasPermission ? "bg-blue-50" : "bg-slate-50 opacity-50"
                        }`}
                      >
                        <div className={`p-1.5 rounded-md ${hasPermission ? "bg-blue-100" : "bg-slate-100"}`}>
                          <Icon className={`h-3.5 w-3.5 ${hasPermission ? "text-blue-600" : "text-slate-400"}`} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${hasPermission ? "text-slate-700" : "text-slate-400"}`}>
                            {perm.label}
                          </p>
                          <p className="text-[10px] text-slate-400">{perm.description}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          hasPermission ? "border-blue-500 bg-blue-500" : "border-slate-300"
                        }`}>
                          {hasPermission && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Role dialog */}
      <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-800">
              Create Custom Role
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Role name</Label>
                <Input
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  placeholder="app_auditor"
                  className="border-slate-200 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Description</Label>
                <Input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Read-only auditor"
                  className="border-slate-200"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Permissions
              </p>
              <div className="space-y-1.5">
                {allPermissions.map((perm) => {
                  const checked = roleForm.permissions.includes(perm.id);
                  return (
                    <label
                      key={perm.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                        checked ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-transparent hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRolePerm(perm.id)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-700">{perm.label}</p>
                        <p className="text-[10px] text-slate-400">{perm.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {roleError && (
              <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {roleError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAddRoleOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={savingRole}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {savingRole ? "Creating..." : "Create Role"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmModal}
    </>
  );
}
