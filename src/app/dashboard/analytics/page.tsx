"use client";

import { useMemo, useState, useEffect } from "react";
import { type Application } from "@/lib/mock-data";
import { useApplications } from "@/lib/api";
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
const COLOR_FINDINGS = "#4f46e5"; // total findings
const COLOR_MITIGATED = "#0d9488"; // mitigated / resolved

// "opsflow/sample-api" → { project: "opsflow", service: "sample-api" }
function splitName(name: string): { project: string; service: string } {
  const i = name.indexOf("/");
  return i === -1
    ? { project: "", service: name }
    : { project: name.slice(0, i), service: name.slice(i + 1) };
}

interface ServiceStat {
  app: Application;
  project: string;
  service: string;
  scanCount: number; // total scanner runs across all builds
  builds: number; // number of image tags
  latestTotal: number;
  latestMitigated: number;
  lastScanned: string | null;
  risk: number;
}

function scanCountOf(app: Application): number {
  return app.imageTags.reduce((n, t) => n + t.scans.length, 0);
}

function buildStat(app: Application): ServiceStat {
  const { project, service } = splitName(app.name);
  const tags = [...app.imageTags].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const latest = tags[tags.length - 1];
  const latestTotal = latest
    ? latest.scans.reduce((s, sc) => s + (sc.total ?? 0), 0)
    : 0;
  const latestMitigated = latest
    ? latest.scans.reduce((s, sc) => s + (sc.resolved ?? 0), 0)
    : 0;
  return {
    app,
    project,
    service,
    scanCount: scanCountOf(app),
    builds: app.imageTags.length,
    latestTotal,
    latestMitigated,
    lastScanned: app.lastScanned ?? null,
    risk: app.riskScore,
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
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

// Searchable service picker (combobox). base-ui Select isn't searchable, so
// this is a small self-contained dropdown with a filter input.
function ServicePicker({
  apps,
  value,
  onChange,
}: {
  apps: Application[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = apps.find((a) => a.id === value);
  const query = q.trim().toLowerCase();
  const filtered = apps
    .filter((a) => !query || a.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative w-full sm:w-96">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
      >
        <span className="truncate">
          {selected ? (
            <>
              {splitName(selected.name).project && (
                <span className="text-slate-400">{splitName(selected.name).project}/</span>
              )}
              <span className="font-medium">{splitName(selected.name).service}</span>
            </>
          ) : (
            <span className="text-slate-400">Select a service…</span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search service…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="max-h-64 overflow-auto p-1">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-400">
                  No services match.
                </p>
              )}
              {filtered.map((a) => {
                const { project, service } = splitName(a.name);
                const active = a.id === value;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onChange(a.id);
                      setOpen(false);
                      setQ("");
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      active ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="truncate">
                      {project && <span className="text-slate-400">{project}/</span>}
                      <span className="font-medium">{service}</span>
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {scanCountOf(a)} scan{scanCountOf(a) !== 1 ? "s" : ""}
                    </span>
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
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const stats = useMemo(
    () =>
      [...applications]
        .map(buildStat)
        .sort((a, b) => b.scanCount - a.scanCount || a.app.name.localeCompare(b.app.name)),
    [applications],
  );

  // Default to the most-scanned service once data arrives.
  useEffect(() => {
    if (!selectedId && stats.length > 0) setSelectedId(stats[0].app.id);
  }, [stats, selectedId]);

  const selected = applications.find((a) => a.id === selectedId);
  const selectedStat = stats.find((s) => s.app.id === selectedId);

  // Trend per build (image tag), chronological. Each point aggregates all
  // scanner runs on that build: total findings and mitigated.
  const trend = useMemo(() => {
    if (!selected) return [];
    return [...selected.imageTags]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((t) => ({
        build: t.tag,
        Findings: t.scans.reduce((s, sc) => s + (sc.total ?? 0), 0),
        Mitigated: t.scans.reduce((s, sc) => s + (sc.resolved ?? 0), 0),
      }));
  }, [selected]);

  return (
    <div>
      <Header
        title="Analytics"
        subtitle="Scan trends and per-service coverage across builds"
      />

      <div className="p-6 space-y-6">
        {/* App/service selector */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Service</p>
            <p className="text-xs text-slate-400">
              Pick a service to see how its findings change build over build.
            </p>
          </div>
          <ServicePicker apps={stats.map((s) => s.app)} value={selectedId} onChange={setSelectedId} />
        </div>

        {loading && <p className="text-sm text-slate-400">Loading analytics…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && stats.length === 0 && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-10 text-center text-sm text-slate-400">
              No applications yet. Import a scan to see analytics.
            </CardContent>
          </Card>
        )}

        {selectedStat && (
          <>
            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                icon={ScanLine}
                label="Total scans"
                value={selectedStat.scanCount}
                accent="bg-indigo-50 text-indigo-600"
              />
              <StatTile
                icon={Layers}
                label="Builds (image tags)"
                value={selectedStat.builds}
                accent="bg-slate-100 text-slate-600"
              />
              <StatTile
                icon={Bug}
                label="Findings (latest build)"
                value={selectedStat.latestTotal}
                accent="bg-rose-50 text-rose-600"
              />
              <StatTile
                icon={ShieldCheck}
                label="Mitigated (latest build)"
                value={selectedStat.latestMitigated}
                accent="bg-teal-50 text-teal-600"
              />
            </div>

            {/* Trend chart (template — re-renders for the selected service) */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 px-5 pt-5">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-slate-400" />
                  Findings vs Mitigated — {selectedStat.service}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {trend.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">
                    No builds scanned yet for this service.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="build"
                        tick={{ fontSize: 12, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
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
                      <Line
                        type="monotone"
                        dataKey="Findings"
                        stroke={COLOR_FINDINGS}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="Mitigated"
                        stroke={COLOR_MITIGATED}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Per-service scan coverage */}
        {stats.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Scan coverage by service
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
                      <th className="px-5 py-2.5 font-medium text-right">Findings</th>
                      <th className="px-5 py-2.5 font-medium text-right">Mitigated</th>
                      <th className="px-5 py-2.5 font-medium">Last scanned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => {
                      const active = s.app.id === selectedId;
                      return (
                        <tr
                          key={s.app.id}
                          onClick={() => setSelectedId(s.app.id)}
                          className={`border-b border-slate-50 cursor-pointer transition-colors ${
                            active ? "bg-indigo-50/60" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-5 py-3">
                            {s.project && <span className="text-slate-400">{s.project}/</span>}
                            <span className="font-medium text-slate-800">{s.service}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-semibold text-slate-800">
                            {s.scanCount}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-600">{s.builds}</td>
                          <td className="px-5 py-3 text-right text-slate-600">{s.latestTotal}</td>
                          <td className="px-5 py-3 text-right text-teal-700">{s.latestMitigated}</td>
                          <td className="px-5 py-3 text-slate-500">{fmtDate(s.lastScanned)}</td>
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
