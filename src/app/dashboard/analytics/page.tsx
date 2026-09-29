"use client";

import { useMemo, useState, useEffect } from "react";
import { type Application } from "@/lib/mock-data";
import { useApplications, useTagSnapshots } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Search,
  ChevronsUpDown,
  ScanLine,
  Layers,
  Bug,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";

// Two-series categorical palette, validated for the light chart surface with
// the dataviz validator (CVD ΔE 22.1 / normal ΔE 27.1 — both pass).
const COLOR_OPEN = "#e11d48"; // open / active findings — the number to drive to 0
const COLOR_MITIGATED = "#0d9488"; // mitigated / resolved

// "nexus/sample-api" → project "nexus", service "sample-api".
// Names without a "/" are their own project (mirrors the Applications page).
function projectOf(name: string): string {
  const i = name.indexOf("/");
  return i === -1 ? name : name.slice(0, i);
}
function serviceOf(name: string): string {
  const i = name.indexOf("/");
  return i === -1 ? name : name.slice(i + 1);
}

function scanCountOf(app: Application): number {
  return app.imageTags.reduce((n, t) => n + t.scans.length, 0);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

// Short axis label for an import time, e.g. "09-29 14:05".
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface ProjectGroup {
  project: string;
  apps: Application[]; // services, sorted by scan count desc
  totalScans: number;
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${accent ?? "bg-slate-100 text-slate-600"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-slate-800 leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ComboItem {
  value: string;
  label: React.ReactNode; // styled display
  keywords: string; // lowercase text used for search
  hint?: string; // right-aligned muted text
}

// Small searchable dropdown (base-ui Select isn't searchable).
function Combobox({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
}: {
  items: ComboItem[];
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = items.find((it) => it.value === value);
  const query = q.trim().toLowerCase();
  const filtered = items.filter((it) => !query || it.keywords.includes(query));

  return (
    <div className="relative w-full sm:w-72">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">{selected ? selected.label : <span className="text-slate-400">{placeholder}</span>}</span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="max-h-64 overflow-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-400">No matches.</p>
              )}
              {filtered.map((it) => {
                const active = it.value === value;
                return (
                  <button
                    key={it.value}
                    type="button"
                    onClick={() => {
                      onChange(it.value);
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      active ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="truncate">{it.label}</span>
                    {it.hint && <span className="text-xs text-slate-400 shrink-0">{it.hint}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { applications, loading, error } = useApplications();
  const [selectedProject, setSelectedProject] = useState<string | undefined>(undefined);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);
  const [selectedTagId, setSelectedTagId] = useState<string | undefined>(undefined);

  // Group services by their project prefix, ordered by scan volume.
  const projects: ProjectGroup[] = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const app of applications) {
      const p = projectOf(app.name);
      (map.get(p) ?? map.set(p, []).get(p)!).push(app);
    }
    return Array.from(map.entries())
      .map(([project, apps]) => {
        const sortedApps = [...apps].sort(
          (a, b) => scanCountOf(b) - scanCountOf(a) || a.name.localeCompare(b.name),
        );
        return {
          project,
          apps: sortedApps,
          totalScans: sortedApps.reduce((n, a) => n + scanCountOf(a), 0),
        };
      })
      .sort((a, b) => b.totalScans - a.totalScans || a.project.localeCompare(b.project));
  }, [applications]);

  // Keep a valid project selected.
  useEffect(() => {
    if (projects.length === 0) return;
    if (!selectedProject || !projects.some((p) => p.project === selectedProject)) {
      setSelectedProject(projects[0].project);
    }
  }, [projects, selectedProject]);

  const activeGroup = projects.find((p) => p.project === selectedProject);

  // When the project changes, default the service to the first one in it.
  useEffect(() => {
    if (!activeGroup) return;
    if (!selectedServiceId || !activeGroup.apps.some((a) => a.id === selectedServiceId)) {
      setSelectedServiceId(activeGroup.apps[0]?.id);
    }
  }, [activeGroup, selectedServiceId]);

  const selected = applications.find((a) => a.id === selectedServiceId);

  // Tags of the selected service, newest first.
  const serviceTags = useMemo(
    () =>
      selected
        ? [...selected.imageTags].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
        : [],
    [selected],
  );

  // Default to the newest tag when the service changes.
  useEffect(() => {
    if (serviceTags.length === 0) {
      if (selectedTagId) setSelectedTagId(undefined);
      return;
    }
    if (!selectedTagId || !serviceTags.some((t) => t.id === selectedTagId)) {
      setSelectedTagId(serviceTags[0].id);
    }
  }, [serviceTags, selectedTagId]);

  const selectedTag = serviceTags.find((t) => t.id === selectedTagId);
  const { snapshots } = useTagSnapshots(selectedTagId);

  const projectItems: ComboItem[] = projects.map((p) => ({
    value: p.project,
    label: <span className="font-medium">{p.project}</span>,
    keywords: p.project.toLowerCase(),
    hint: `${p.apps.length} service${p.apps.length !== 1 ? "s" : ""}`,
  }));

  const serviceItems: ComboItem[] = (activeGroup?.apps ?? []).map((a) => ({
    value: a.id,
    label: <span className="font-medium">{serviceOf(a.name)}</span>,
    keywords: a.name.toLowerCase(),
    hint: `${scanCountOf(a)} scan${scanCountOf(a) !== 1 ? "s" : ""}`,
  }));

  const tagItems: ComboItem[] = serviceTags.map((t) => ({
    value: t.id,
    label: <span className="font-medium">{t.tag}</span>,
    keywords: t.tag.toLowerCase(),
  }));

  // Trend from the selected tag's per-import snapshots (oldest → newest), so
  // progress is visible even when re-imported into the same tag (e.g. latest).
  const trend = useMemo(
    () =>
      snapshots.map((p, i) => ({
        point: fmtTime(p.importedAt) || `#${i + 1}`,
        Open: p.open,
        Mitigated: p.mitigated,
      })),
    [snapshots],
  );

  const scanCount = selected ? scanCountOf(selected) : 0;
  const builds = selected ? selected.imageTags.length : 0;
  const latestOpen = trend.length ? trend[trend.length - 1].Open : 0;
  const latestMitigated = trend.length ? trend[trend.length - 1].Mitigated : 0;

  return (
    <div>
      <Header
        title="Analytics"
        subtitle="Scan trends and per-service coverage across builds"
      />

      <div className="p-6 space-y-6">
        {/* Cascading selectors: App → Service */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Application</label>
            <Combobox
              items={projectItems}
              value={selectedProject}
              onChange={(v) => {
                setSelectedProject(v);
                setSelectedServiceId(undefined); // reset; effect picks the first service
              }}
              placeholder="Select an application…"
              searchPlaceholder="Search application…"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Service</label>
            <Combobox
              items={serviceItems}
              value={selectedServiceId}
              onChange={(v) => {
                setSelectedServiceId(v);
                setSelectedTagId(undefined); // reset; effect picks the newest tag
              }}
              placeholder="Select a service…"
              searchPlaceholder="Search service…"
              disabled={!activeGroup}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-500">Tag</label>
            <Combobox
              items={tagItems}
              value={selectedTagId}
              onChange={setSelectedTagId}
              placeholder="Select a tag…"
              searchPlaceholder="Search tag…"
              disabled={!selected || serviceTags.length === 0}
            />
          </div>
        </div>

        {loading && <p className="text-sm text-slate-400">Loading analytics…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && projects.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-10 text-center text-sm text-slate-400">
              No applications yet. Import a scan to see analytics.
            </CardContent>
          </Card>
        )}

        {selected && (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile icon={ScanLine} label="Total scans" value={scanCount} accent="bg-indigo-50 text-indigo-600" />
              <StatTile icon={Layers} label="Builds (image tags)" value={builds} accent="bg-slate-100 text-slate-600" />
              <StatTile icon={Bug} label="Open findings (latest)" value={latestOpen} accent="bg-rose-50 text-rose-600" />
              <StatTile icon={ShieldCheck} label="Mitigated (latest import)" value={latestMitigated} accent="bg-teal-50 text-teal-600" />
            </div>

            {/* Trend chart (template — re-renders for the selected service) */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-slate-400" />
                  Open vs Mitigated — {serviceOf(selected.name)}
                  {selectedTag ? <span className="text-slate-400"> : {selectedTag.tag}</span> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {trend.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    No imports recorded yet for this tag.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="point"
                        padding={{ left: 28, right: 28 }}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        padding={{ top: 16, bottom: 12 }}
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: "none",
                          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                        }}
                      />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="Open" stroke={COLOR_OPEN} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Mitigated" stroke={COLOR_MITIGATED} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Per-service scan coverage for the selected application */}
        {activeGroup && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Scan coverage — {activeGroup.project}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                      <th className="px-5 py-2.5 font-medium">Service</th>
                      <th className="px-5 py-2.5 font-medium text-right">Scans</th>
                      <th className="px-5 py-2.5 font-medium text-right">Builds</th>
                      <th className="px-5 py-2.5 font-medium">Last scanned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup.apps.map((a) => {
                      const active = a.id === selectedServiceId;
                      return (
                        <tr
                          key={a.id}
                          onClick={() => setSelectedServiceId(a.id)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors ${
                            active ? "bg-indigo-50/60" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-5 py-3 font-medium text-slate-800">{serviceOf(a.name)}</td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-800">{scanCountOf(a)}</td>
                          <td className="px-5 py-3 text-right text-slate-600">{a.imageTags.length}</td>
                          <td className="px-5 py-3 text-slate-500">{fmtDate(a.lastScanned ?? null)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
