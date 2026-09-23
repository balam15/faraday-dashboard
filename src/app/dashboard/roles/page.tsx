"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useUsers,
  useApplications,
  useGroupMappings,
  updateGroupMapping,
} from "@/lib/api";
import { Header } from "@/components/layout/header";
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
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Eye,
  Upload,
  Settings,
  Check,
  X,
} from "lucide-react";

interface Permission {
  id: string;
  label: string;
  description: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  isSystem: boolean;
}

interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  lastLogin: string;
  status: "active" | "inactive";
}

interface LdapGroupAccess {
  id: string;
  shortName: string;
  dn: string;
  role: string;
  /** null means all apps (Admin) */
  allowedApps: string[] | null;
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

// Fixed, code-defined roles (RBAC is role-string based; there is no custom-role
// backend). userCount is filled in live from the real user list.
const roleDefs: Role[] = [
  {
    id: "r1",
    name: "Admin",
    description: "Full access to all features",
    permissions: allPermissions.map((p) => p.id),
    userCount: 0,
    isSystem: true,
  },
  {
    id: "r2",
    name: "Security Engineer",
    description: "Can import scans and manage findings",
    permissions: ["view_dashboard", "view_applications", "view_findings", "import_scans", "manage_findings"],
    userCount: 0,
    isSystem: true,
  },
  {
    id: "r3",
    name: "Developer",
    description: "Read-only access to findings for their apps",
    permissions: ["view_dashboard", "view_applications", "view_findings"],
    userCount: 0,
    isSystem: true,
  },
  {
    id: "r4",
    name: "Viewer",
    description: "Dashboard and findings view only",
    permissions: ["view_dashboard", "view_findings"],
    userCount: 0,
    isSystem: true,
  },
];

// Canonical backend role → display label used by the UI's color maps.
const ROLE_DISPLAY: Record<string, string> = {
  admin: "Admin",
  security_engineer: "Security Engineer",
  developer: "Developer",
  viewer: "Viewer",
};

function toDisplayRole(role: string): string {
  return ROLE_DISPLAY[role.toLowerCase().replace(/\s+/g, "_")] ?? role;
}

function shortNameFromDn(dn: string): string {
  const m = dn.match(/CN=([^,]+)/i);
  return m ? m[1] : dn;
}

const roleColors: Record<string, string> = {
  Admin: "bg-red-100 text-red-700 border-red-200",
  "Security Engineer": "bg-purple-100 text-purple-700 border-purple-200",
  Developer: "bg-blue-100 text-blue-700 border-blue-200",
  Viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

const appColors: Record<string, string> = {
  "payment-service": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "auth-api": "bg-violet-100 text-violet-700 border-violet-200",
  "frontend-web": "bg-sky-100 text-sky-700 border-sky-200",
  "notification-worker": "bg-amber-100 text-amber-700 border-amber-200",
};

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

export default function RolesPage() {
  const [activeTab, setActiveTab] = useState<"roles" | "app-access" | "users">("roles");
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);

  // Live data
  const { users } = useUsers();
  const { applications } = useApplications();
  const { mappings, reload: reloadMappings } = useGroupMappings();

  const availableApps = useMemo(
    () => applications.map((a) => a.name),
    [applications],
  );

  // Fill role userCount from the real user list.
  const mockRoles = useMemo(() => {
    const counts: Record<string, number> = {};
    users.forEach((u) => {
      const d = toDisplayRole(u.role);
      counts[d] = (counts[d] ?? 0) + 1;
    });
    return roleDefs.map((r) => ({ ...r, userCount: counts[r.name] ?? 0 }));
  }, [users]);

  // Real users mapped to the shape this page's markup expects.
  const mockUsers: User[] = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        email: u.email ?? "",
        role: toDisplayRole(u.role),
        lastLogin: u.last_login || u.created_at,
        status: u.is_active ? "active" : "inactive",
      })),
    [users],
  );

  // App Access tab state — seeded from real LDAP group mappings.
  const [groupAccess, setGroupAccess] = useState<LdapGroupAccess[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string[]>([]);

  useEffect(() => {
    setGroupAccess(
      mappings.map((m) => ({
        id: m.id,
        shortName: shortNameFromDn(m.group_dn),
        dn: m.group_dn,
        role: toDisplayRole(m.role),
        allowedApps: m.apps,
      })),
    );
  }, [mappings]);

  const startEdit = (group: LdapGroupAccess) => {
    setEditingGroupId(group.id);
    setEditDraft(group.allowedApps ?? availableApps);
  };

  const cancelEdit = () => {
    setEditingGroupId(null);
    setEditDraft([]);
  };

  const saveEdit = async (groupId: string) => {
    // Optimistic UI update, then persist and refetch.
    setGroupAccess((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, allowedApps: editDraft } : g)),
    );
    setEditingGroupId(null);
    const apps = editDraft;
    setEditDraft([]);
    try {
      await updateGroupMapping(groupId, { apps });
      reloadMappings();
    } catch {
      reloadMappings();
    }
  };

  const toggleApp = (app: string) => {
    setEditDraft((prev) =>
      prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]
    );
  };

  const tabs = [
    { key: "roles", label: "Roles" },
    { key: "app-access", label: "App Access" },
    { key: "users", label: "Users" },
  ] as const;

  return (
    <div>
      <Header
        title="Roles & Access"
        subtitle="Manage user roles and permissions"
      />

      <div className="p-6 space-y-6">
        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Roles Tab ── */}
        {activeTab === "roles" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {mockRoles.length} roles configured
              </p>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="h-4 w-4" />
                New Role
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {mockRoles.map((role) => (
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
                        <p className="text-xs text-slate-500 mt-0.5">
                          {role.description}
                        </p>
                      </div>
                      {!role.isSystem && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-400" />
                          </button>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
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
          </>
        )}

        {/* ── App Access Tab ── */}
        {activeTab === "app-access" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {groupAccess.length} LDAP groups · configure per-group app visibility
              </p>
            </div>

            <Card className="border-0 shadow-sm overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_2fr_auto_2fr_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Group</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Full DN</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Role</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Accessible Apps</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Actions</span>
              </div>

              <CardContent className="p-0">
                {groupAccess.map((group, idx) => {
                  const isEditing = editingGroupId === group.id;
                  return (
                    <div key={group.id}>
                      {/* Main row */}
                      <div
                        className={`grid grid-cols-[1fr_2fr_auto_2fr_auto] gap-4 items-center px-5 py-4 ${
                          idx < groupAccess.length - 1 || isEditing
                            ? "border-b border-slate-50"
                            : ""
                        } hover:bg-slate-50/60 transition-colors`}
                      >
                        {/* Group name */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <Users className="h-4 w-4 text-indigo-600" />
                          </div>
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {group.shortName}
                          </span>
                        </div>

                        {/* Full DN */}
                        <span className="text-xs text-slate-400 font-mono truncate" title={group.dn}>
                          {group.dn}
                        </span>

                        {/* Role badge */}
                        <Badge
                          variant="outline"
                          className={`text-xs border whitespace-nowrap ${roleColors[group.role] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}
                        >
                          {group.role}
                        </Badge>

                        {/* Accessible apps */}
                        <div className="flex flex-wrap gap-1">
                          {group.allowedApps === null ? (
                            <Badge
                              variant="outline"
                              className="text-xs border bg-red-100 text-red-700 border-red-200"
                            >
                              All Apps
                            </Badge>
                          ) : group.allowedApps.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">None</span>
                          ) : (
                            group.allowedApps.map((app) => (
                              <Badge
                                key={app}
                                variant="outline"
                                className={`text-[11px] border ${appColors[app] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                              >
                                {app}
                              </Badge>
                            ))
                          )}
                        </div>

                        {/* Edit button */}
                        <button
                          onClick={() => (isEditing ? cancelEdit() : startEdit(group))}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isEditing
                              ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                          }`}
                        >
                          {isEditing ? (
                            <>
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </>
                          ) : (
                            <>
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </>
                          )}
                        </button>
                      </div>

                      {/* Inline edit panel — expands below the row */}
                      {isEditing && (
                        <div className="px-5 py-4 bg-blue-50/40 border-b border-slate-100">
                          <p className="text-xs font-semibold text-slate-600 mb-3">
                            Select accessible apps for{" "}
                            <span className="text-blue-700">{group.shortName}</span>
                          </p>
                          <div className="flex flex-wrap gap-3 mb-4">
                            {availableApps.map((app) => {
                              const checked = editDraft.includes(app);
                              return (
                                <label
                                  key={app}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors select-none ${
                                    checked
                                      ? `${appColors[app] ?? "bg-slate-100 text-slate-600 border-slate-200"} border`
                                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={checked}
                                    onChange={() => toggleApp(app)}
                                  />
                                  <div
                                    className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                      checked
                                        ? "border-current bg-current/20"
                                        : "border-slate-300 bg-white"
                                    }`}
                                  >
                                    {checked && (
                                      <Check className="h-2.5 w-2.5" />
                                    )}
                                  </div>
                                  <span className="text-xs font-medium">{app}</span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(group.id)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Save Changes
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-xs font-medium rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <span className="text-xs text-slate-400 ml-1">
                              {editDraft.length} app{editDraft.length !== 1 ? "s" : ""} selected
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Users Tab ── */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {mockUsers.length} users synced from Active Directory
              </p>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="h-4 w-4" />
                Assign User
              </button>
            </div>

            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {mockUsers.map((user, idx) => (
                  <div
                    key={user.id}
                    className={`flex items-center gap-4 px-5 py-4 ${
                      idx < mockUsers.length - 1 ? "border-b border-slate-50" : ""
                    } hover:bg-slate-50 transition-colors`}
                  >
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-blue-700">
                        {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {user.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {user.username} · {user.email}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-xs border ${roleColors[user.role] || "bg-gray-100 text-gray-600"}`}
                      >
                        {user.role}
                      </Badge>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          user.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {user.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(user.lastLogin).toLocaleDateString()}
                      </span>
                      <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
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
    </div>
  );
}
