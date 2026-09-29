"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useUsers,
  useApplications,
  useRoles,
  useDirectoryUsers,
  createUser,
  updateUserRole,
  setUserActive,
  setUserApps,
  deleteUser,
} from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";

// ── Local helpers (kept in sync with the rest of the dashboard) ──
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

const roleColors: Record<string, string> = {
  Admin: "bg-red-100 text-red-700 border-red-200",
  "Security Engineer": "bg-purple-100 text-purple-700 border-purple-200",
  Developer: "bg-blue-100 text-blue-700 border-blue-200",
  Viewer: "bg-gray-100 text-gray-600 border-gray-200",
};

interface UserRow {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  authType: string;
  allowedApps: string[] | null;
  lastLogin: string;
  status: "active" | "inactive";
}

type AccessModeT = "none" | "all" | "specific";

function AppAccessSelector({
  mode,
  apps,
  availableApps,
  onMode,
  onToggleApp,
}: {
  mode: AccessModeT;
  apps: string[];
  availableApps: string[];
  onMode: (m: AccessModeT) => void;
  onToggleApp: (app: string) => void;
}) {
  const modes: { key: AccessModeT; label: string }[] = [
    { key: "none", label: "No access" },
    { key: "all", label: "All apps" },
    { key: "specific", label: "Specific" },
  ];
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-600">App access</Label>
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onMode(m.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === m.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "specific" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {availableApps.length === 0 && (
            <span className="text-xs text-slate-400">No applications yet.</span>
          )}
          {availableApps.map((app) => {
            const on = apps.includes(app);
            return (
              <button
                key={app}
                type="button"
                onClick={() => onToggleApp(app)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  on
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                {app}
              </button>
            );
          })}
        </div>
      )}
      {mode === "none" && (
        <p className="text-xs text-slate-400">User won&apos;t see any application until granted.</p>
      )}
      {mode === "all" && (
        <p className="text-xs text-slate-400">User can see every application.</p>
      )}
    </div>
  );
}

export function ManageUsersSection() {
  const { users, reload: reloadUsers } = useUsers();
  const { applications } = useApplications();
  const { roles: apiRoles } = useRoles();
  const { configured: ldapConfigured, users: dirUsers, loading: dirLoading } = useDirectoryUsers();
  const { confirm, ConfirmModal } = useConfirm();

  // Which set of accounts to show: local (managed here) or the live directory.
  const [source, setSource] = useState<"local" | "directory">("local");

  const roleOptions = useMemo(
    () => apiRoles.map((r) => ({ value: r.name, label: toDisplayRole(r.name) })),
    [apiRoles],
  );
  const availableApps = useMemo(() => applications.map((a) => a.name), [applications]);

  const rows: UserRow[] = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: u.display_name || u.username,
        username: u.username,
        email: u.email ?? "",
        role: toDisplayRole(u.role),
        authType: u.auth_type,
        allowedApps: u.allowed_apps,
        lastLogin: u.last_login || u.created_at,
        status: u.is_active ? "active" : "inactive",
      })),
    [users],
  );

  // Add-user dialog
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    display_name: "",
    email: "",
    password: "",
    role: "viewer",
  });
  const [savingUser, setSavingUser] = useState(false);
  const [userError, setUserError] = useState("");
  const [newUserAccess, setNewUserAccess] = useState<AccessModeT>("none");
  const [newUserApps, setNewUserApps] = useState<string[]>([]);

  function accessToAllowedApps(mode: AccessModeT, apps: string[]): string[] | null {
    if (mode === "all") return null;
    if (mode === "specific") return apps;
    return [];
  }

  async function handleCreateUser() {
    if (newUser.username.length < 3 || newUser.password.length < 8) {
      setUserError("Username min 3 chars, password min 8 chars.");
      return;
    }
    setSavingUser(true);
    setUserError("");
    try {
      await createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        email: newUser.email.trim() || undefined,
        display_name: newUser.display_name.trim() || undefined,
        role: newUser.role,
        allowed_apps: accessToAllowedApps(newUserAccess, newUserApps),
      });
      setAddUserOpen(false);
      setNewUser({ username: "", display_name: "", email: "", password: "", role: "viewer" });
      setNewUserAccess("none");
      setNewUserApps([]);
      reloadUsers();
    } catch (e) {
      setUserError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSavingUser(false);
    }
  }

  // Manage-user dialog
  const [manageUser, setManageUser] = useState<UserRow | null>(null);
  const [manageAccess, setManageAccess] = useState<AccessModeT>("none");
  const [manageApps, setManageApps] = useState<string[]>([]);

  useEffect(() => {
    if (!manageUser) return;
    if (manageUser.allowedApps === null) {
      setManageAccess("all");
      setManageApps([]);
    } else if (manageUser.allowedApps.length === 0) {
      setManageAccess("none");
      setManageApps([]);
    } else {
      setManageAccess("specific");
      setManageApps(manageUser.allowedApps);
    }
  }, [manageUser]);

  async function handleChangeRole(userId: string, role: string) {
    await updateUserRole(userId, role);
    reloadUsers();
  }

  async function handleToggleActive(userId: string, active: boolean) {
    await setUserActive(userId, active);
    setManageUser(null);
    reloadUsers();
  }

  async function handleDeleteUser(userId: string) {
    const name = manageUser?.name ?? "this user";
    const ok = await confirm({
      title: "Delete user?",
      message: `"${name}" will be permanently removed. This cannot be undone.`,
      confirmLabel: "Delete user",
    });
    if (!ok) return;
    await deleteUser(userId);
    setManageUser(null);
    reloadUsers();
  }

  async function handleSaveManageApps() {
    if (!manageUser) return;
    await setUserApps(manageUser.id, accessToAllowedApps(manageAccess, manageApps));
    setManageUser(null);
    reloadUsers();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setSource("local")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              source === "local" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Dashboard accounts ({rows.length})
          </button>
          <button
            onClick={() => setSource("directory")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              source === "directory" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Directory (LDAP){ldapConfigured ? ` (${dirUsers.length})` : ""}
          </button>
        </div>
        {source === "local" && (
          <button
            onClick={() => setAddUserOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      {source === "local" ? (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No users yet.</p>
          )}
          {rows.map((user, idx) => (
            <div
              key={user.id}
              className={`flex items-center gap-4 px-5 py-4 ${
                idx < rows.length - 1 ? "border-b border-slate-50" : ""
              } hover:bg-slate-50 transition-colors`}
            >
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-blue-700">
                  {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-400">
                  {user.username}{user.email ? ` · ${user.email}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    user.authType === "ldap"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                  title={user.authType === "ldap" ? "Active Directory user" : "Local account"}
                >
                  {user.authType === "ldap" ? "LDAP" : "Local"}
                </span>
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
                <button
                  onClick={() => setManageUser(user)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Manage user"
                >
                  <Pencil className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {!ldapConfigured ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-500">
                  Not connected to a directory yet.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Configure and save the connection under Settings → LDAP / AD, then
                  the users allowed to sign in will appear here automatically.
                </p>
              </div>
            ) : dirLoading ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">
                Reading users from the directory…
              </p>
            ) : dirUsers.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">
                No matching directory users. Check the User Search Filter in LDAP settings.
              </p>
            ) : (
              dirUsers.map((u, idx) => (
                <div
                  key={u.dn || u.username}
                  className={`flex items-center gap-4 px-5 py-4 ${
                    idx < dirUsers.length - 1 ? "border-b border-slate-50" : ""
                  } hover:bg-slate-50 transition-colors`}
                >
                  <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-indigo-700">
                      {(u.display_name || u.username).split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {u.display_name || u.username}
                    </p>
                    <p className="text-xs text-slate-400">
                      {u.username}
                      {u.email ? ` · ${u.email}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border bg-indigo-50 text-indigo-700 border-indigo-200">
                      LDAP
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-xs border ${roleColors[toDisplayRole(u.resolved_role)] || "bg-gray-100 text-gray-600"}`}
                      title="Role resolved from the user's AD group memberships"
                    >
                      {toDisplayRole(u.resolved_role)}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {u.groups_count} group{u.groups_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
      {source === "directory" && ldapConfigured && dirUsers.length > 0 && (
        <p className="text-xs text-slate-400">
          Live from the directory. Roles are resolved automatically from AD group
          mappings; accounts are created on the user&apos;s first sign-in.
        </p>
      )}

      {/* Add User dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-800">
              Add Local User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Username</Label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                placeholder="jane.doe"
                className="border-slate-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Display name</Label>
                <Input
                  value={newUser.display_name}
                  onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                  placeholder="Jane Doe"
                  className="border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Role</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v ?? "viewer" })}>
                  <SelectTrigger className="border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Email (optional)</Label>
              <Input
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="jane.doe@maybank.com"
                className="border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Min 8 characters"
                className="border-slate-200"
              />
            </div>
            <AppAccessSelector
              mode={newUserAccess}
              apps={newUserApps}
              availableApps={availableApps}
              onMode={setNewUserAccess}
              onToggleApp={(app) =>
                setNewUserApps((prev) =>
                  prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app],
                )
              }
            />
            {userError && (
              <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {userError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAddUserOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={savingUser}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {savingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage User dialog */}
      <Dialog open={!!manageUser} onOpenChange={(o) => !o && setManageUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-800">
              {manageUser?.name}
            </DialogTitle>
          </DialogHeader>
          {manageUser && (
            <div className="space-y-4 mt-2">
              <p className="text-xs text-slate-400">
                {manageUser.username}
                {manageUser.email ? ` · ${manageUser.email}` : ""}
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Role</Label>
                <Select
                  value={roleOptions.find((o) => o.label === manageUser.role)?.value ?? "viewer"}
                  onValueChange={(v) => {
                    if (v) {
                      handleChangeRole(manageUser.id, v);
                      setManageUser({ ...manageUser, role: toDisplayRole(v) });
                    }
                  }}
                >
                  <SelectTrigger className="border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                  <AppAccessSelector
                    mode={manageAccess}
                    apps={manageApps}
                    availableApps={availableApps}
                    onMode={setManageAccess}
                    onToggleApp={(app) =>
                      setManageApps((prev) =>
                        prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app],
                      )
                    }
                  />
                </div>
                <button
                  onClick={handleSaveManageApps}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  Save access
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  onClick={() =>
                    handleToggleActive(manageUser.id, manageUser.status !== "active")
                  }
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  {manageUser.status === "active" ? "Disable account" : "Enable account"}
                </button>
                <button
                  onClick={() => handleDeleteUser(manageUser.id)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete user
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmModal}
    </>
  );
}
