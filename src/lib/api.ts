"use client";

import { useCallback, useEffect, useState } from "react";
import type { Application, Finding } from "./mock-data";

/**
 * Thin API client for the FastAPI backend. All calls are same-origin
 * (Next.js rewrites /api/* to the backend), so the httpOnly session cookie
 * is sent automatically — no token handling in JS.
 */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== "undefined") {
    // Session expired or missing — bounce to login.
    window.location.href = "/login";
    throw new ApiError(401, "Not authenticated");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { credentials: "include" }));
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
}

// ── Read hooks ────────────────────────────────────────────────────

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useAsync<T>(fetcher: () => Promise<T>, initial: T, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    let alive = true;
    setLoading(true);
    fetcher()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Request failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);
  return { data, loading, error, reload: run };
}

export function useApplications() {
  const s = useAsync<Application[]>(() => apiGet("/api/apps"), [], []);
  return { applications: s.data, loading: s.loading, error: s.error, reload: s.reload };
}

export function useApplication(id: string | undefined) {
  const s = useAsync<Application | null>(
    () => (id ? apiGet<Application>(`/api/apps/${id}`) : Promise.resolve(null)),
    null,
    [id],
  );
  return { application: s.data, loading: s.loading, error: s.error, reload: s.reload };
}

export function deleteApp(id: string) {
  return apiSend(`/api/apps/${id}`, "DELETE");
}

export function deleteTag(id: string) {
  return apiSend(`/api/tags/${id}`, "DELETE");
}

export function useScanFindings(scanId: string | undefined) {
  const s = useAsync<Finding[]>(
    () => (scanId ? apiGet<Finding[]>(`/api/scans/${scanId}/findings`) : Promise.resolve([])),
    [],
    [scanId],
  );
  return { findings: s.data, loading: s.loading, error: s.error };
}

export function useFindings() {
  const s = useAsync<Finding[]>(() => apiGet("/api/findings"), [], []);
  return { findings: s.data, loading: s.loading, error: s.error, reload: s.reload };
}

// ── Mutations ─────────────────────────────────────────────────────

export function updateFindingStatus(id: string, status: Finding["status"]) {
  return apiSend(`/api/findings/${id}?status=${encodeURIComponent(status)}`, "PATCH");
}

export async function logout() {
  try {
    await apiSend("/api/auth/logout", "POST");
  } finally {
    if (typeof window !== "undefined") window.location.href = "/login";
  }
}

export interface ImportScanArgs {
  file: File;
  appName: string;
  tag: string;
  scanType: string;
  digest?: string;
  team?: string;
  appType?: string;
}

export async function importScan(args: ImportScanArgs) {
  const form = new FormData();
  form.append("file", args.file);
  form.append("app_name", args.appName);
  form.append("tag", args.tag);
  form.append("scan_type", args.scanType);
  if (args.digest) form.append("digest", args.digest);
  if (args.team) form.append("team", args.team);
  if (args.appType) form.append("app_type", args.appType);
  return handle<{ ok: boolean; findings: number; scanner: string }>(
    await fetch("/api/import-scan", { method: "POST", credentials: "include", body: form }),
  );
}

export function useScanTypes() {
  const s = useAsync<{ scan_types: string[] }>(
    () => apiGet("/api/scanners"),
    { scan_types: [] },
    [],
  );
  return { scanTypes: s.data.scan_types, loading: s.loading };
}

// ── Users (admin) ─────────────────────────────────────────────────

export interface ApiUser {
  id: string;
  username: string;
  email: string | null;
  display_name: string | null;
  role: string;
  auth_type: string;
  allowed_apps: string[] | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export function useUsers() {
  const s = useAsync<ApiUser[]>(() => apiGet("/api/users"), [], []);
  return { users: s.data, loading: s.loading, error: s.error, reload: s.reload };
}

export interface NewUser {
  username: string;
  password: string;
  email?: string;
  display_name?: string;
  role: string;
  // [] = no access (default), null = all apps, [names] = specific.
  allowed_apps?: string[] | null;
}

export function createUser(body: NewUser) {
  return apiSend<ApiUser>("/api/users", "POST", body);
}

export function setUserApps(id: string, allowed_apps: string[] | null) {
  return apiSend(`/api/users/${id}/apps`, "PATCH", { allowed_apps });
}

export function updateUserRole(id: string, role: string) {
  return apiSend(`/api/users/${id}/role?role=${encodeURIComponent(role)}`, "PATCH");
}

export function setUserActive(id: string, active: boolean) {
  return apiSend(`/api/users/${id}/active?active=${active}`, "PATCH");
}

export function deleteUser(id: string) {
  return apiSend(`/api/users/${id}`, "DELETE");
}

// ── Roles / permissions ───────────────────────────────────────────

export interface ApiRole {
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  user_count: number;
}

export function useRoles() {
  const s = useAsync<{ roles: ApiRole[]; all_permissions: string[] }>(
    () => apiGet("/api/roles"),
    { roles: [], all_permissions: [] },
    [],
  );
  return {
    roles: s.data.roles,
    allPermissions: s.data.all_permissions,
    loading: s.loading,
    reload: s.reload,
  };
}

export function createRole(body: { name: string; description?: string; permissions: string[] }) {
  return apiSend<ApiRole>("/api/roles", "POST", body);
}

export function updateRole(name: string, body: { description?: string; permissions?: string[] }) {
  return apiSend<ApiRole>(`/api/roles/${name}`, "PATCH", body);
}

export function deleteRole(name: string) {
  return apiSend(`/api/roles/${name}`, "DELETE");
}

export interface Me {
  username: string;
  display_name?: string;
  role: string;
  permissions: string[];
}

export function useMe() {
  const s = useAsync<Me | null>(() => apiGet("/api/auth/me"), null, []);
  return { me: s.data, loading: s.loading };
}

// ── LDAP config + group mappings (admin) ──────────────────────────

export interface LdapConfig {
  host?: string;
  port?: number;
  base_dn?: string;
  bind_dn?: string;
  user_filter?: string;
  username_attr?: string;
  email_attr?: string;
  display_name_attr?: string;
  tls_verify?: boolean;
  use_ssl?: boolean;
}

export function useLdapConfig() {
  const s = useAsync<LdapConfig>(() => apiGet("/api/ldap/config"), {}, []);
  return { config: s.data, loading: s.loading, reload: s.reload };
}

export function saveLdapConfig(cfg: LdapConfig & { bind_password?: string }) {
  return apiSend("/api/ldap/config", "PUT", cfg);
}

export function testLdap() {
  return apiSend<{ ok: boolean; message: string }>("/api/ldap/test", "POST");
}

export interface GroupMapping {
  id: string;
  group_dn: string;
  role: string;
  apps: string[] | null;
  created_at?: string;
}

export function useGroupMappings() {
  const s = useAsync<GroupMapping[]>(() => apiGet("/api/ldap/groups"), [], []);
  return { mappings: s.data, loading: s.loading, reload: s.reload };
}

export function addGroupMapping(m: { group_dn: string; role: string; apps: string[] | null }) {
  return apiSend("/api/ldap/groups", "POST", m);
}

export function updateGroupMapping(id: string, patch: { role?: string; apps?: string[] | null }) {
  return apiSend(`/api/ldap/groups/${id}`, "PATCH", patch);
}

export function deleteGroupMapping(id: string) {
  return apiSend(`/api/ldap/groups/${id}`, "DELETE");
}

// ── API keys (admin) ──────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string | null;
  last_used: string | null;
  is_active: boolean;
}

export function useApiKeys() {
  const s = useAsync<ApiKeyRow[]>(() => apiGet("/api/apikeys"), [], []);
  return { keys: s.data, loading: s.loading, reload: s.reload };
}

export function createApiKey(name: string) {
  return apiSend<{ id: string; name: string; prefix: string; key: string }>(
    "/api/apikeys",
    "POST",
    { name },
  );
}

export function revokeApiKey(id: string) {
  return apiSend(`/api/apikeys/${id}`, "DELETE");
}
