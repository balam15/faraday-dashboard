"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getRiskBadgeClass, getTotalFindings, type Application } from "@/lib/mock-data";
import { useApplications } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SeverityCounts } from "@/components/ui/severity-badge";
import { ImportScanDialog } from "@/components/import-scan-dialog";
import {
  ChevronRight,
  Tag,
  Clock,
  Globe,
  Server,
  Smartphone,
  Wrench,
  UploadCloud,
  Boxes,
  Layers,
  ArrowLeft,
  Search,
} from "lucide-react";

const typeIcons = {
  web: Globe,
  api: Server,
  mobile: Smartphone,
  service: Wrench,
};

const typeColors = {
  web: "bg-blue-50 text-blue-700 border-blue-200",
  api: "bg-purple-50 text-purple-700 border-purple-200",
  mobile: "bg-green-50 text-green-700 border-green-200",
  service: "bg-orange-50 text-orange-700 border-orange-200",
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// An "application" groups services by the prefix before the first "/"
// (e.g. "opsflow/sample-api" → application "opsflow", service "sample-api").
function projectOf(name: string): string {
  const i = name.indexOf("/");
  return i > 0 ? name.slice(0, i) : name;
}
function serviceOf(name: string): string {
  const i = name.indexOf("/");
  return i > 0 ? name.slice(i + 1) : name;
}

interface ProjectGroup {
  project: string;
  services: Application[];
  totals: ReturnType<typeof getTotalFindings>;
  risk: number;
  scans: number;
  lastScanned: string;
}

export default function ApplicationsPage() {
  const { applications, reload } = useApplications();
  const [importOpen, setImportOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const projects = useMemo<ProjectGroup[]>(() => {
    const map = new Map<string, Application[]>();
    for (const app of applications) {
      const p = projectOf(app.name);
      (map.get(p) ?? map.set(p, []).get(p)!).push(app);
    }
    return Array.from(map.entries())
      .map(([project, services]) => ({
        project,
        services,
        totals: getTotalFindings(services),
        risk: services.reduce((m, s) => Math.max(m, s.riskScore), 0),
        scans: services.reduce(
          (n, s) => n + s.imageTags.reduce((a, t) => a + t.scans.length, 0),
          0,
        ),
        lastScanned: services
          .map((s) => s.lastScanned)
          .sort()
          .slice(-1)[0] ?? "",
      }))
      .sort((a, b) => b.risk - a.risk);
  }, [applications]);

  const q = query.trim().toLowerCase();

  // ── Level 2: services within the selected project ──
  if (selectedProject) {
    const group = projects.find((p) => p.project === selectedProject);
    const services = (group?.services ?? [])
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => b.riskScore - a.riskScore);

    return (
      <div>
        <Header title={selectedProject} subtitle={`${group?.services.length ?? 0} services`} />
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={() => { setSelectedProject(null); setQuery(""); }}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to applications
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services..."
                className="pl-9 w-64 h-9 text-sm bg-white border-slate-200"
              />
            </div>
          </div>

          {services.map((app) => {
            const TypeIcon = typeIcons[app.type];
            const totalScans = app.imageTags.reduce((acc, tag) => acc + tag.scans.length, 0);
            const totalTags = app.imageTags.length;
            return (
              <Link key={app.id} href={`/dashboard/applications/${app.id}`}>
                <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-slate-200 transition-colors flex-shrink-0">
                        <TypeIcon className="h-5 w-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {serviceOf(app.name)}
                          </p>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize border ${typeColors[app.type]}`}>
                            {app.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-500 truncate">{app.description || app.name}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Tag className="h-3 w-3" />
                            {totalTags} image tag{totalTags !== 1 ? "s" : ""}
                          </span>
                          <span className="text-slate-200">|</span>
                          <span className="text-xs text-slate-400">{totalScans} scan{totalScans !== 1 ? "s" : ""}</span>
                          <span className="text-slate-200">|</span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatDate(app.lastScanned)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <SeverityCounts
                          critical={app.totalFindings.critical}
                          high={app.totalFindings.high}
                          medium={app.totalFindings.medium}
                          low={app.totalFindings.low}
                          info={app.totalFindings.info}
                        />
                        <div className="text-center">
                          <div className={`text-sm font-bold px-2.5 py-1 rounded-lg ${getRiskBadgeClass(app.riskScore)}`}>
                            {app.riskScore}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">risk</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
          {services.length === 0 && (
            <p className="text-sm text-slate-400 py-8 text-center">No services match your search.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Level 1: applications (projects) ──
  const shown = projects.filter(
    (p) => !q || p.project.toLowerCase().includes(q) || p.services.some((s) => s.name.toLowerCase().includes(q)),
  );

  return (
    <div>
      <Header title="Applications" subtitle={`${projects.length} application${projects.length !== 1 ? "s" : ""}`} />

      <div className="p-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search applications or services..."
              className="pl-9 w-72 h-9 text-sm bg-white border-slate-200"
            />
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            Import Scan
          </button>
        </div>

        <ImportScanDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={reload} />

        {shown.map((p) => (
          <Card
            key={p.project}
            onClick={() => { setSelectedProject(p.project); setQuery(""); }}
            className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-100 transition-colors flex-shrink-0">
                  <Boxes className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                    {p.project}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Layers className="h-3 w-3" />
                      {p.services.length} service{p.services.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-slate-200">|</span>
                    <span className="text-xs text-slate-400">{p.scans} scan{p.scans !== 1 ? "s" : ""}</span>
                    {p.lastScanned && (
                      <>
                        <span className="text-slate-200">|</span>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(p.lastScanned)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <SeverityCounts
                    critical={p.totals.critical}
                    high={p.totals.high}
                    medium={p.totals.medium}
                    low={p.totals.low}
                    info={p.totals.info}
                  />
                  <div className="text-center">
                    <div className={`text-sm font-bold px-2.5 py-1 rounded-lg ${getRiskBadgeClass(p.risk)}`}>
                      {p.risk}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">risk</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">
            {projects.length === 0 ? "No applications yet. Import a scan to get started." : "No applications match your search."}
          </p>
        )}
      </div>
    </div>
  );
}
