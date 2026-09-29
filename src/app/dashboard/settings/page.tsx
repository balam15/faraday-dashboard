"use client";

import { useEffect, useState } from "react";
import {
  useLdapConfig,
  useGroupMappings,
  useApiKeys,
  useApplications,
  useSystemSettings,
  useRoles,
  saveLdapConfig,
  saveSystemSettings,
  testLdap,
  addGroupMapping,
  deleteGroupMapping,
  createApiKey,
  revokeApiKey,
  type SystemSettings,
} from "@/lib/api";
import { Header } from "@/components/layout/header";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Bell,
  ShieldCheck,
  Save,
  CheckCircle2,
  XCircle,
  KeyRound,
  Loader2,
  Trash2,
  Plus,
  Users,
  BookOpen,
  ExternalLink,
  UserCog,
  FileKey,
  UserSearch,
  FolderTree,
  ChevronRight,
  Building2,
} from "lucide-react";
import {
  verifyLdapMapping,
  useCertificates,
  addCertificate,
  deleteCertificate,
  useDirectoryGroups,
  fetchGroupMembers,
  type CertificateRow,
  type DirectoryMember,
  type DirectoryUser,
} from "@/lib/api";
import { ManageUsersSection } from "./manage-users";
import { ManageRolesSection } from "./manage-roles";

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupRole = string; // a role name (system or custom), e.g. "security_engineer"

interface GroupMapping {
  id: string;
  groupDn: string;
  role: GroupRole;
  apps: string[]; // empty array means "All Apps" (Admin)
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Badge styles keyed by canonical (snake_case) role name; custom roles fall
// back to a neutral style.
const ROLE_BADGE_STYLES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  security_engineer: "bg-blue-100 text-blue-700 border-blue-200",
  developer: "bg-green-100 text-green-700 border-green-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
};

function roleBadgeStyle(role: string): string {
  return ROLE_BADGE_STYLES[role] ?? "bg-indigo-100 text-indigo-700 border-indigo-200";
}

function prettyRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const tabs = [
  { id: "ldap", label: "LDAP / AD", icon: Server },
  { id: "users", label: "Manage Users", icon: UserCog },
  { id: "roles", label: "Manage Roles", icon: ShieldCheck },
  { id: "certs", label: "Certificates", icon: FileKey },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "api", label: "API Keys", icon: KeyRound },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("ldap");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmModal } = useConfirm();

  // Live backend data
  const { config: ldapConfig } = useLdapConfig();
  const { mappings, reload: reloadMappings } = useGroupMappings();
  const { keys: apiKeys, reload: reloadKeys } = useApiKeys();
  const { applications } = useApplications();
  const { settings: loadedSettings } = useSystemSettings();
  const { certificates, reload: reloadCerts } = useCertificates();
  const { configured: dirConfigured, groups: dirGroups, loading: dirGroupsLoading } = useDirectoryGroups();
  const availableApps = applications.map((a) => a.name);

  // System settings (Security + Notifications)
  const [sys, setSys] = useState<Partial<SystemSettings>>({});
  const [smtpPassword, setSmtpPassword] = useState("");
  useEffect(() => {
    if (loadedSettings && Object.keys(loadedSettings).length) setSys(loadedSettings);
  }, [loadedSettings]);
  const setS = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) =>
    setSys((prev) => ({ ...prev, [key]: value }));

  // LDAP state
  const [ldapHost, setLdapHost] = useState("");
  const [ldapPort, setLdapPort] = useState("636");
  const [ldapBaseDn, setLdapBaseDn] = useState("");
  const [ldapBindDn, setLdapBindDn] = useState("");
  const [ldapBindPassword, setLdapBindPassword] = useState("");
  const [ldapUserFilter, setLdapUserFilter] = useState("");
  const [ldapUsernameAttr, setLdapUsernameAttr] = useState("sAMAccountName");
  const [ldapEmailAttr, setLdapEmailAttr] = useState("mail");
  const [ldapDisplayNameAttr, setLdapDisplayNameAttr] = useState("displayName");
  const [ldapTlsVerify, setLdapTlsVerify] = useState("true");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);

  // Verify-mapping state: previews the users the current config resolves.
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<DirectoryUser[] | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Certificate import state
  const [certName, setCertName] = useState("");
  const [certPem, setCertPem] = useState("");
  const [certUsage, setCertUsage] = useState("ldap");
  const [certAdding, setCertAdding] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  // Manage-users: which AD group is expanded to show members (fetched live)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, DirectoryMember[]>>({});
  const [membersLoading, setMembersLoading] = useState<string | null>(null);

  async function toggleGroup(dn: string) {
    if (expandedGroup === dn) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(dn);
    if (!groupMembers[dn]) {
      setMembersLoading(dn);
      try {
        const res = await fetchGroupMembers(dn);
        setGroupMembers((prev) => ({ ...prev, [dn]: res.members }));
      } catch {
        setGroupMembers((prev) => ({ ...prev, [dn]: [] }));
      } finally {
        setMembersLoading(null);
      }
    }
  }

  // API key creation state
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ name: string; key: string } | null>(null);

  async function handleCreateKey() {
    const name = newKeyName.trim() || "CI/CD Key";
    setCreatingKey(true);
    try {
      const res = await createApiKey(name);
      setCreatedKey({ name: res.name, key: res.key });
      setNewKeyName("");
      reloadKeys();
    } catch {
      /* ignore */
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(id: string) {
    const ok = await confirm({
      title: "Revoke API key?",
      message: "The key will be removed. Any CI/CD pipeline using it will stop working.",
      confirmLabel: "Revoke key",
    });
    if (!ok) return;
    try {
      await revokeApiKey(id);
    } finally {
      reloadKeys();
    }
  }

  // Hydrate the LDAP form once the saved config loads.
  useEffect(() => {
    if (!ldapConfig || Object.keys(ldapConfig).length === 0) return;
    if (ldapConfig.host) setLdapHost(ldapConfig.host);
    if (ldapConfig.port) setLdapPort(String(ldapConfig.port));
    if (ldapConfig.base_dn) setLdapBaseDn(ldapConfig.base_dn);
    if (ldapConfig.bind_dn) setLdapBindDn(ldapConfig.bind_dn);
    if (ldapConfig.user_filter) setLdapUserFilter(ldapConfig.user_filter);
    if (ldapConfig.username_attr) setLdapUsernameAttr(ldapConfig.username_attr);
    if (ldapConfig.email_attr) setLdapEmailAttr(ldapConfig.email_attr);
    if (ldapConfig.display_name_attr) setLdapDisplayNameAttr(ldapConfig.display_name_attr);
    if (ldapConfig.tls_verify !== undefined) setLdapTlsVerify(String(ldapConfig.tls_verify));
  }, [ldapConfig]);

  // Roles (system + custom) for the mapping dropdown
  const { roles } = useRoles();
  const roleOptions = roles.map((r) => ({ value: r.name, label: prettyRole(r.name) }));

  // Group mapping state (seeded from backend)
  const [groupMappings, setGroupMappings] = useState<GroupMapping[]>([]);
  const [newGroupDn, setNewGroupDn] = useState("");
  const [newRole, setNewRole] = useState<GroupRole>("developer");
  const [newApps, setNewApps] = useState<string[]>([]);
  const [newAppsInput, setNewAppsInput] = useState("");

  useEffect(() => {
    setGroupMappings(
      mappings.map((m) => ({
        id: m.id,
        groupDn: m.group_dn,
        role: (m.role || "").toLowerCase().replace(/\s+/g, "_"),
        apps: m.apps ?? [],
      })),
    );
  }, [mappings]);

  // ── Handlers ────────────────────────────────────────────────────────────

  // Current LDAP form values, so Test / Verify work before saving.
  function draftLdap() {
    return {
      host: ldapHost,
      port: Number(ldapPort) || 636,
      base_dn: ldapBaseDn,
      bind_dn: ldapBindDn,
      user_filter: ldapUserFilter || undefined,
      username_attr: ldapUsernameAttr,
      email_attr: ldapEmailAttr,
      display_name_attr: ldapDisplayNameAttr,
      tls_verify: ldapTlsVerify === "true",
      use_ssl: ldapHost.startsWith("ldaps://") || ldapPort === "636",
      ...(ldapBindPassword ? { bind_password: ldapBindPassword } : {}),
    };
  }

  const [ldapSaveError, setLdapSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      if (activeTab === "ldap") {
        // Block saving an empty / half-filled configuration.
        const missing = [
          [ldapHost, "LDAP Host"],
          [ldapBaseDn, "Base DN"],
          [ldapBindDn, "Bind DN"],
        ].filter(([v]) => !String(v).trim()).map(([, l]) => l);
        if (!ldapBindPassword.trim() && !ldapConfig?.host) missing.push("Bind Password");
        if (missing.length) {
          setLdapSaveError("Please fill in: " + missing.join(", ") + ".");
          setSaving(false);
          return;
        }
        setLdapSaveError(null);
        await saveLdapConfig(draftLdap());
      } else {
        // Notifications / Security / API tabs all persist system settings.
        await saveSystemSettings({
          ...sys,
          ...(smtpPassword ? { smtp_password: smtpPassword } : {}),
        });
        setSmtpPassword("");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      /* surfaced via disabled state; keep it simple */
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    setTestOk(null);
    try {
      const res = await testLdap(draftLdap());
      setTestResult(res.message || "Connection successful");
      setTestOk(true);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : "Connection failed");
      setTestOk(false);
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyMapping() {
    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const res = await verifyLdapMapping(draftLdap());
      setVerifyResult(res.users);
      setVerifyOpen(true);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleAddCertificate() {
    const pem = certPem.trim();
    if (!pem) return;
    setCertAdding(true);
    setCertError(null);
    try {
      await addCertificate({ name: certName.trim() || "Imported certificate", pem, usage: certUsage });
      setCertName("");
      setCertPem("");
      setCertUsage("ldap");
      reloadCerts();
    } catch (e) {
      setCertError(e instanceof Error ? e.message : "Could not import certificate");
    } finally {
      setCertAdding(false);
    }
  }

  async function handleDeleteCertificate(id: string, name: string) {
    const ok = await confirm({
      title: "Delete certificate?",
      message: `"${name}" will no longer be trusted for outbound TLS connections.`,
      confirmLabel: "Delete certificate",
    });
    if (!ok) return;
    try {
      await deleteCertificate(id);
    } finally {
      reloadCerts();
    }
  }

  async function handleDeleteMapping(id: string) {
    const ok = await confirm({
      title: "Delete group mapping?",
      message: "This LDAP group → role mapping will be removed.",
      confirmLabel: "Delete mapping",
    });
    if (!ok) return;
    setGroupMappings((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteGroupMapping(id);
    } finally {
      reloadMappings();
    }
  }

  function handleToggleApp(app: string) {
    setNewApps((prev) =>
      prev.includes(app) ? prev.filter((a) => a !== app) : [...prev, app]
    );
  }

  async function handleAddMapping() {
    const dn = newGroupDn.trim();
    if (!dn) return;

    const isAdmin = newRole === "admin";
    const appsList = isAdmin ? [] : newApps.length > 0
      ? newApps
      : newAppsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    try {
      await addGroupMapping({
        group_dn: dn,
        role: newRole,
        apps: isAdmin ? null : appsList,
      });
      reloadMappings();
    } catch {
      /* ignore; admin can retry */
    }

    setNewGroupDn("");
    setNewRole("developer");
    setNewApps([]);
    setNewAppsInput("");
  }

  function appsLabel(mapping: GroupMapping): string {
    if (mapping.role === "admin" || mapping.apps.length === 0) return "All Apps";
    return mapping.apps.join(", ");
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const groupMappingCard = (
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-5 pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-500" />
                      Group Mapping
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Map AD security groups to platform roles and restrict
                      application access.
                    </p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-5">
                    {/* Existing mappings table */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              AD Group DN
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Role
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Apps Access
                            </th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupMappings.length === 0 && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-8 text-center text-sm text-slate-400"
                              >
                                No group mappings configured yet.
                              </td>
                            </tr>
                          )}
                          {groupMappings.map((mapping, idx) => (
                            <tr
                              key={mapping.id}
                              className={`border-b border-slate-100 last:border-0 ${
                                idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                              }`}
                            >
                              <td className="px-4 py-3 font-mono text-xs text-slate-700 max-w-xs truncate">
                                {mapping.groupDn}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleBadgeStyle(
                                    mapping.role,
                                  )}`}
                                >
                                  {prettyRole(mapping.role)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {mapping.role === "admin" ||
                                mapping.apps.length === 0 ? (
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-slate-500 border-slate-200"
                                  >
                                    All Apps
                                  </Badge>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {mapping.apps.map((app) => (
                                      <Badge
                                        key={app}
                                        variant="outline"
                                        className="text-xs font-mono text-slate-600 border-slate-200"
                                      >
                                        {app}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleDeleteMapping(mapping.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                                  title="Delete mapping"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Add new mapping form */}
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 space-y-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Add New Mapping
                      </p>

                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          AD Group DN
                        </Label>
                        <Input
                          value={newGroupDn}
                          onChange={(e) => setNewGroupDn(e.target.value)}
                          placeholder="CN=Infosec-Team,OU=Groups,DC=maybank,DC=com"
                          className="border-slate-200 font-mono text-sm bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-slate-600">
                            Role
                          </Label>
                          <Select
                            value={newRole}
                            onValueChange={(v) =>
                              setNewRole(v ?? "developer")
                            }
                          >
                            <SelectTrigger className="border-slate-200 bg-white">
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

                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-slate-600">
                            Apps Access
                          </Label>
                          {newRole === "admin" ? (
                            <div className="flex items-center h-9 px-3 rounded-md border border-slate-200 bg-slate-100 text-sm text-slate-500">
                              All Apps (Admin role)
                            </div>
                          ) : (
                            <Input
                              value={newAppsInput}
                              onChange={(e) => setNewAppsInput(e.target.value)}
                              placeholder="payment-service, auth-api, ..."
                              className="border-slate-200 bg-white text-sm"
                            />
                          )}
                          {newRole !== "admin" && (
                            <p className="text-xs text-slate-400">
                              Comma-separated or click below to select
                            </p>
                          )}
                        </div>
                      </div>

                      {/* App chip multi-select (only when not Admin) */}
                      {newRole !== "admin" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-slate-500">
                            Quick-select apps
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {availableApps.map((app) => {
                              const active = newApps.includes(app);
                              return (
                                <button
                                  key={app}
                                  type="button"
                                  onClick={() => handleToggleApp(app)}
                                  className={`px-2.5 py-1 rounded-full text-xs font-mono font-medium border transition-all ${
                                    active
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                                  }`}
                                >
                                  {app}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs text-slate-400">
                            Chip selection overrides the text input above.
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={handleAddMapping}
                          disabled={!newGroupDn.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Add Mapping
                        </button>
                      </div>
                    </div>

                    {/* Live preview of apps label */}
                    {groupMappings.length > 0 && (
                      <p className="text-xs text-slate-400">
                        {groupMappings.length} group mapping
                        {groupMappings.length !== 1 ? "s" : ""} configured.
                      </p>
                    )}
                  </CardContent>
                </Card>
  );

  return (
    <div>
      <Header title="Settings" subtitle="System configuration" />

      <div className="p-6">
        <div className="flex gap-6">
          {/* Sidebar tabs */}
          <div className="w-48 flex-shrink-0">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  <tab.icon className="h-4 w-4 flex-shrink-0" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            {activeTab === "ldap" && (
              <>
                {/* ── LDAP Connection ── */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-6 pb-4">
                    <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                      <Server className="h-4 w-4 text-slate-500" />
                      Active Directory / LDAP Configuration
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Configure LDAPS connection to your Active Directory for user
                      authentication.
                    </p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-5">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          LDAP Host
                        </Label>
                        <Input
                          value={ldapHost}
                          onChange={(e) => setLdapHost(e.target.value)}
                          placeholder="ldaps://ad.example.com"
                          className="border-slate-200"
                        />
                        <p className="text-xs text-slate-400">
                          Use ldaps:// for secure connection (port 636)
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          Port
                        </Label>
                        <Input
                          value={ldapPort}
                          onChange={(e) => setLdapPort(e.target.value)}
                          placeholder="636"
                          className="border-slate-200"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        Base DN
                      </Label>
                      <Input
                        value={ldapBaseDn}
                        onChange={(e) => setLdapBaseDn(e.target.value)}
                        placeholder="DC=example,DC=com"
                        className="border-slate-200 font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        Bind DN (Service Account)
                      </Label>
                      <Input
                        value={ldapBindDn}
                        onChange={(e) => setLdapBindDn(e.target.value)}
                        placeholder="CN=svc-account,DC=example,DC=com"
                        className="border-slate-200 font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        Bind Password
                      </Label>
                      <Input
                        value={ldapBindPassword}
                        onChange={(e) => setLdapBindPassword(e.target.value)}
                        type="password"
                        placeholder="Service account password"
                        className="border-slate-200"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-slate-600">
                        User Search Filter
                      </Label>
                      <Input
                        value={ldapUserFilter}
                        onChange={(e) => setLdapUserFilter(e.target.value)}
                        placeholder="(&(objectClass=user)(memberOf=CN=...))"
                        className="border-slate-200 font-mono text-sm"
                      />
                      <p className="text-xs text-slate-400">
                        LDAP filter to restrict which users can log in
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Attribute Mapping ── */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-5 pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-700">
                      Attribute Mapping
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-6 pb-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          Username Attribute
                        </Label>
                        <Input
                          value={ldapUsernameAttr}
                          onChange={(e) => setLdapUsernameAttr(e.target.value)}
                          placeholder="sAMAccountName"
                          className="border-slate-200 font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          Email Attribute
                        </Label>
                        <Input
                          value={ldapEmailAttr}
                          onChange={(e) => setLdapEmailAttr(e.target.value)}
                          placeholder="mail"
                          className="border-slate-200 font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          Display Name Attribute
                        </Label>
                        <Input
                          value={ldapDisplayNameAttr}
                          onChange={(e) => setLdapDisplayNameAttr(e.target.value)}
                          placeholder="displayName"
                          className="border-slate-200 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                      <div className="pr-4">
                        <p className="text-sm font-medium text-slate-700">
                          Verify TLS certificate
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {ldapTlsVerify === "true"
                            ? "The server certificate is validated against imported CAs (Settings → Certificates). Recommended."
                            : "Certificate validation is disabled — only for dev/testing against a self-signed server."}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={ldapTlsVerify === "true"}
                          onChange={(e) => setLdapTlsVerify(e.target.checked ? "true" : "false")}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </CardContent>
                </Card>


                {/* ── Test connection ── */}
                <Card className="border-0 shadow-sm border-dashed border-slate-200 bg-slate-50/50">
                  <CardContent className="px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          Test Connection
                        </p>
                        <p className="text-xs text-slate-400">
                          Binds with the service account to verify host, port, TLS
                          and credentials. Save your changes first.
                        </p>
                      </div>
                      <button
                        onClick={handleTestConnection}
                        disabled={testing}
                        className="px-4 py-2 border border-slate-300 hover:bg-white disabled:opacity-60 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {testing ? "Testing..." : "Test LDAP Connection"}
                      </button>
                    </div>
                    {testResult && (
                      <div
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                          testOk
                            ? "bg-green-50 border-green-100 text-green-700"
                            : "bg-red-50 border-red-100 text-red-700"
                        }`}
                      >
                        {testOk ? (
                          <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        )}
                        <span>{testResult}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ── Verify user mapping ── */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-5 pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <UserSearch className="h-4 w-4 text-slate-500" />
                      Verify User Mapping
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Runs the connection and attribute mapping above and shows the
                      users the directory returns — so you can confirm the mapping
                      is right. No save required.
                    </p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        Uses the values currently in the form (host, bind account,
                        search filter and attribute mapping).
                      </p>
                      <button
                        onClick={handleVerifyMapping}
                        disabled={verifying}
                        className="h-9 px-4 border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 flex-shrink-0"
                      >
                        {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                        {verifying ? "Resolving..." : "Verify Mapping"}
                      </button>
                    </div>

                    {verifyError && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                        <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{verifyError}</span>
                      </div>
                    )}

                    {verifyResult && !verifyOpen && (
                      <button
                        onClick={() => setVerifyOpen(true)}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Show last result ({verifyResult.length} users)
                      </button>
                    )}
                  </CardContent>
                </Card>

                {/* Verify user — result popup */}
                <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        Users resolved from directory
                        {verifyResult && (
                          <span className="text-sm font-normal text-slate-400">
                            ({verifyResult.length})
                          </span>
                        )}
                      </DialogTitle>
                    </DialogHeader>
                    <p className="text-xs text-slate-500">
                      These are the users your current connection + attribute mapping
                      return. Check the name, email and role columns look right.
                    </p>
                    <div className="mt-1 max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200">
                      {verifyResult && verifyResult.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-400">
                          No users matched. Check the Base DN and User Search Filter.
                        </p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(verifyResult || []).map((u, idx) => (
                              <tr
                                key={u.dn || u.username}
                                className={`border-b border-slate-100 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                              >
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-slate-800">{u.display_name || u.username}</p>
                                  <p className="text-xs text-slate-400 font-mono">{u.username}</p>
                                </td>
                                <td className="px-4 py-2.5 text-slate-600">{u.email || "—"}</td>
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleBadgeStyle(u.resolved_role)}`}
                                    title={`${u.groups_count} group memberships`}
                                  >
                                    {prettyRole(u.resolved_role)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => setVerifyOpen(false)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}

            {activeTab === "users" && (
              <>
                {/* ── User accounts (local + directory) — real management ── */}
                <ManageUsersSection />

                {/* ── Active Directory Groups browser ── */}
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-5 pb-3">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-slate-500" />
                      Active Directory Groups
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Browse security groups synced from the directory. Click a group
                      to see its members and the role they inherit.
                    </p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-2">
                    {!dirConfigured ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-slate-500">
                          Not connected to a directory yet.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Configure and save the connection under LDAP / AD, then groups
                          appear here automatically.
                        </p>
                      </div>
                    ) : dirGroupsLoading ? (
                      <p className="py-8 text-center text-sm text-slate-400">
                        Reading groups from the directory…
                      </p>
                    ) : dirGroups.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">
                        No security groups found under the Base DN.
                      </p>
                    ) : (
                      dirGroups.map((g) => {
                        const open = expandedGroup === g.dn;
                        const members = groupMembers[g.dn] || [];
                        return (
                          <div key={g.dn} className="rounded-xl border border-slate-200 overflow-hidden">
                            <button
                              onClick={() => toggleGroup(g.dn)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                            >
                              <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
                              <Building2 className="h-4 w-4 text-slate-400" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800">{g.name}</p>
                                <p className="text-xs text-slate-400 font-mono truncate">{g.dn}</p>
                              </div>
                              {g.mapped_role && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${roleBadgeStyle(g.mapped_role)}`}>
                                  {prettyRole(g.mapped_role)}
                                </span>
                              )}
                              <span className="text-xs text-slate-400 ml-1 flex-shrink-0">
                                {g.member_count} {g.member_count === 1 ? "member" : "members"}
                              </span>
                            </button>
                            {open && (
                              <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
                                {membersLoading === g.dn ? (
                                  <p className="px-5 py-3 text-xs text-slate-400">Loading members…</p>
                                ) : members.length === 0 ? (
                                  <p className="px-5 py-3 text-xs text-slate-400">No members returned.</p>
                                ) : (
                                  members.map((m) => (
                                    <div key={m.username} className="flex items-center gap-3 px-5 py-2.5">
                                      <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                                        {(m.display_name || m.username).charAt(0)}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700">{m.display_name || m.username}</p>
                                        <p className="text-xs text-slate-400">{m.email}</p>
                                      </div>
                                      <span className="text-xs font-mono text-slate-400">{m.username}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                {/* ── Group → Role mapping (moved here from LDAP) ── */}
                {groupMappingCard}
              </>
            )}

            {activeTab === "roles" && (
              <div className="space-y-4">
                <ManageRolesSection />
              </div>
            )}

            {activeTab === "certs" && (
              <>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="px-6 pt-6 pb-4">
                    <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                      <FileKey className="h-4 w-4 text-slate-500" />
                      Trusted Certificates
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-1">
                      Import CA or server certificates so Vulnera can make secure
                      outbound connections (e.g. LDAPS to an internal AD with a
                      private CA) with certificate verification turned on.
                    </p>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-4">
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Expires</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Trusted for</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {certificates.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No certificates imported yet.</td></tr>
                          )}
                          {certificates.map((c: CertificateRow, idx) => (
                            <tr key={c.id} className={`border-b border-slate-100 last:border-0 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                              <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-600 max-w-xs truncate" title={c.subject || ""}>{c.subject || "—"}</td>
                              <td className="px-4 py-3 text-xs text-slate-600">{c.not_after ? new Date(c.not_after).toLocaleDateString() : "—"}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs text-slate-600 border-slate-200">
                                  {c.usage === "all" ? "All TLS" : "LDAP"}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleDeleteCertificate(c.id, c.name)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Import form */}
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 space-y-4">
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        Import Certificate
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-slate-600">Name</Label>
                          <Input
                            value={certName}
                            onChange={(e) => setCertName(e.target.value)}
                            placeholder="Maybank Internal Root CA"
                            className="border-slate-200 bg-white text-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium text-slate-600">Trusted for</Label>
                          <Select value={certUsage} onValueChange={(v) => setCertUsage(v ?? "ldap")}>
                            <SelectTrigger className="w-full border-slate-200 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ldap">LDAP / Active Directory</SelectItem>
                              <SelectItem value="all">All outbound TLS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">PEM certificate</Label>
                        <textarea
                          value={certPem}
                          onChange={(e) => setCertPem(e.target.value)}
                          placeholder={"-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"}
                          rows={6}
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                        />
                        <p className="text-xs text-slate-400">
                          Paste the CA or server certificate in PEM format (a
                          -----BEGIN CERTIFICATE----- block).
                        </p>
                      </div>
                      {certError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                          <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>{certError}</span>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleAddCertificate}
                          disabled={certAdding || !certPem.trim()}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {certAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          {certAdding ? "Importing..." : "Import Certificate"}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === "notifications" && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="px-6 pt-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-slate-500" />
                    Notification Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-5">
                  {([
                    ["notify_new_critical", "New Critical Finding", "Email when a critical finding is imported"],
                    ["notify_new_high", "New High Finding", "Email when a high finding is imported"],
                    ["notify_scan_completed", "Scan Completed", "Notify when a scan import finishes"],
                    ["notify_weekly_summary", "Weekly Summary", "Weekly digest of new findings per application"],
                  ] as const).map(([key, label, desc]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(sys[key])}
                          onChange={(e) => setS(key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}

                  <div className="space-y-1.5 pt-2">
                    <Label className="text-sm font-medium text-slate-600">Notification Email</Label>
                    <Input
                      value={sys.notification_email ?? ""}
                      onChange={(e) => setS("notification_email", e.target.value)}
                      placeholder="security-team@example.com"
                      className="border-slate-200"
                    />
                    <p className="text-xs text-slate-400">
                      Critical/high findings are emailed to this address
                    </p>
                  </div>

                  {/* SMTP server (used to send the emails above) */}
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-sm font-semibold text-slate-700 mb-3">SMTP Server</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-2 space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">Host</Label>
                        <Input
                          value={sys.smtp_host ?? ""}
                          onChange={(e) => setS("smtp_host", e.target.value)}
                          placeholder="smtp.maybank.co.id"
                          className="border-slate-200"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">Port</Label>
                        <Input
                          value={String(sys.smtp_port ?? 587)}
                          onChange={(e) => setS("smtp_port", Number(e.target.value) || 587)}
                          className="border-slate-200"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">Username</Label>
                        <Input
                          value={sys.smtp_user ?? ""}
                          onChange={(e) => setS("smtp_user", e.target.value)}
                          placeholder="(optional)"
                          className="border-slate-200"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">
                          Password {sys.smtp_password_set && <span className="text-green-600 text-xs">(set)</span>}
                        </Label>
                        <Input
                          type="password"
                          value={smtpPassword}
                          onChange={(e) => setSmtpPassword(e.target.value)}
                          placeholder={sys.smtp_password_set ? "••••••• (leave blank to keep)" : "(optional)"}
                          className="border-slate-200"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">From address</Label>
                        <Input
                          value={sys.smtp_from ?? ""}
                          onChange={(e) => setS("smtp_from", e.target.value)}
                          placeholder="vulnera@maybank.co.id"
                          className="border-slate-200"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium text-slate-600">TLS (STARTTLS)</Label>
                        <Select
                          value={sys.smtp_tls === false ? "false" : "true"}
                          onValueChange={(v) => setS("smtp_tls", v === "true")}
                        >
                          <SelectTrigger className="border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Enabled</SelectItem>
                            <SelectItem value="false">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "security" && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="px-6 pt-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-slate-500" />
                    Security Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-5">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Session Timeout</p>
                      <p className="text-xs text-slate-400">How long a login stays valid</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={String(sys.session_timeout_minutes ?? 480)}
                        onChange={(e) => setS("session_timeout_minutes", Number(e.target.value) || 480)}
                        className="w-24 border-slate-200 text-right"
                      />
                      <span className="text-sm text-slate-500">minutes</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Max Login Attempts</p>
                      <p className="text-xs text-slate-400">Lock the account after this many failures (0 = off)</p>
                    </div>
                    <Input
                      value={String(sys.max_login_attempts ?? 5)}
                      onChange={(e) => setS("max_login_attempts", Number(e.target.value) || 0)}
                      className="w-24 border-slate-200 text-right"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Lockout Duration</p>
                      <p className="text-xs text-slate-400">How long an account stays locked</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={String(sys.lockout_minutes ?? 15)}
                        onChange={(e) => setS("lockout_minutes", Number(e.target.value) || 15)}
                        className="w-24 border-slate-200 text-right"
                      />
                      <span className="text-sm text-slate-500">minutes</span>
                    </div>
                  </div>

                  {([
                    ["audit_logging", "Audit Logging", "Record actions in the activity feed"],
                    ["force_https", "Force HTTPS", "Mark the session cookie Secure (HTTPS only)"],
                  ] as const).map(([key, label, desc]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(sys[key])}
                          onChange={(e) => setS(key, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-5 peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {activeTab === "api" && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="px-6 pt-6 pb-4">
                  <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-500" />
                    API Keys
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-1">
                    Use API keys to import scan results from CI/CD pipelines.
                  </p>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-4">
                  {/* Interactive API documentation */}
                  <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Interactive API Documentation
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Browse and try every endpoint (OpenAPI / Swagger).
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href="/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <BookOpen className="h-4 w-4" />
                        Swagger UI
                        <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                      </a>
                      <a
                        href="/redoc"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-white text-slate-700 text-sm font-medium rounded-lg transition-colors"
                      >
                        ReDoc
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </a>
                    </div>
                  </div>

                  {createdKey && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
                      <p className="text-sm font-medium text-green-800">
                        New key “{createdKey.name}” created
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Copy it now — it won&apos;t be shown again.
                      </p>
                      <code className="block mt-2 font-mono text-xs bg-white border border-green-200 rounded-lg px-3 py-2 break-all text-slate-800">
                        {createdKey.key}
                      </code>
                    </div>
                  )}

                  {apiKeys.length === 0 && (
                    <p className="text-sm text-slate-400 py-2">
                      No API keys yet. Generate one for your CI/CD pipeline.
                    </p>
                  )}

                  {apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {apiKey.name}
                          {!apiKey.is_active && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
                              revoked
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-xs text-slate-500 mt-0.5">
                          {apiKey.prefix}••••
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Created {apiKey.created_at?.slice(0, 10) ?? "—"} · Last used{" "}
                          {apiKey.last_used?.slice(0, 10) ?? "never"}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevokeKey(apiKey.id)}
                        className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                      >
                        {apiKey.is_active ? "Revoke" : "Remove"}
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2">
                    <Input
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Key name (e.g. GitLab CI)"
                      className="border-slate-200"
                    />
                    <button
                      onClick={handleCreateKey}
                      disabled={creatingKey}
                      className="flex items-center justify-center gap-2 whitespace-nowrap px-4 py-2 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-60 rounded-xl text-sm text-slate-500 hover:text-blue-600 transition-all"
                    >
                      {creatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Generate
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Save button — only for tabs that persist system/LDAP settings.
                Users, Certificates and API Keys manage themselves inline. */}
            {!["users", "roles", "certs", "api"].includes(activeTab) && (
              <div className="flex items-center justify-end gap-3 pt-2">
                {activeTab === "ldap" && ldapSaveError && (
                  <span className="flex items-center gap-1.5 text-sm text-red-600">
                    <XCircle className="h-4 w-4" />
                    {ldapSaveError}
                  </span>
                )}
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Settings saved
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {ConfirmModal}
    </div>
  );
}
