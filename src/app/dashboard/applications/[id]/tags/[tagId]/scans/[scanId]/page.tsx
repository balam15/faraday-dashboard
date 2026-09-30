"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useApplication, useScanFindings, useMe, updateFindingStatus } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge, SeverityCounts } from "@/components/ui/severity-badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileCode2,
  AlertTriangle,
  CheckCircle2,
  ShieldX,
  Info,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import type { Finding } from "@/lib/mock-data";

const statusConfig = {
  open: {
    icon: AlertTriangle,
    color: "text-red-500",
    label: "Open",
    badge: "bg-red-100 text-red-700",
  },
  mitigated: {
    icon: CheckCircle2,
    color: "text-green-500",
    label: "Mitigated",
    badge: "bg-green-100 text-green-700",
  },
  false_positive: {
    icon: ShieldX,
    color: "text-gray-400",
    label: "False Positive",
    badge: "bg-gray-100 text-gray-600",
  },
  accepted: {
    icon: Info,
    color: "text-blue-400",
    label: "Accepted",
    badge: "bg-blue-100 text-blue-700",
  },
};

function FindingRow({
  finding,
  expanded,
  onToggle,
  canManage,
  onChanged,
}: {
  finding: Finding;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
  onChanged: (status: Finding["status"]) => void;
}) {
  const status = statusConfig[finding.status];
  const StatusIcon = status.icon;

  return (
    <div className="border-b border-slate-50">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full text-left flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors group ${
          expanded ? "bg-slate-50" : ""
        }`}
      >
        <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${status.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors truncate">
            {finding.title}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {finding.filePath && (
              <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
                <FileCode2 className="h-3 w-3" />
                {finding.filePath}
                {finding.lineNumber && `:${finding.lineNumber}`}
              </span>
            )}
            {finding.cwe && <span className="text-xs text-slate-400">{finding.cwe}</span>}
            {finding.cve && <span className="text-xs text-blue-500">{finding.cve}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <SeverityBadge severity={finding.severity} />
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${status.badge}`}>
            {status.label}
          </span>
          <ChevronRight
            className={`h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
          />
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-slate-50/60">
          <FindingDetailBody finding={finding} canManage={canManage} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

const STATUS_ORDER: Finding["status"][] = ["open", "mitigated", "false_positive", "accepted"];

function StatusControl({
  finding,
  canManage,
  onChanged,
}: {
  finding: Finding;
  canManage: boolean;
  onChanged: (status: Finding["status"]) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  if (!canManage) return null;

  async function set(next: Finding["status"]) {
    if (next === finding.status) return;
    setSaving(next);
    try {
      await updateFindingStatus(finding.id, next);
      onChanged(next);
    } catch {
      /* ignore */
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-xs font-medium text-slate-500 mb-2">Set status</p>
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => {
          const cfg = statusConfig[s];
          const active = finding.status === s;
          return (
            <button
              key={s}
              onClick={() => set(s)}
              disabled={saving !== null}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 ${
                active
                  ? `${cfg.badge} border-transparent ring-2 ring-offset-1 ring-current`
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {saving === s ? "Saving..." : cfg.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FindingDetailBody({
  finding,
  canManage,
  onChanged,
}: {
  finding: Finding;
  canManage: boolean;
  onChanged: (status: Finding["status"]) => void;
}) {
  const status = statusConfig[finding.status];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="space-y-4">
          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityBadge severity={finding.severity} />
            <Badge variant="outline" className="text-xs border-slate-200">
              {finding.scanner}
            </Badge>
            <Badge variant="outline" className="text-xs border-slate-200">
              {finding.scanType}
            </Badge>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.badge}`}
            >
              {status.label}
            </span>
          </div>

          <StatusControl finding={finding} canManage={canManage} onChanged={onChanged} />

          {/* Location */}
          {finding.filePath && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">
                Location
              </p>
              <p className="font-mono text-sm text-slate-700">
                {finding.filePath}
                {finding.lineNumber && (
                  <span className="text-blue-600">:{finding.lineNumber}</span>
                )}
              </p>
            </div>
          )}

          {/* IDs */}
          {(finding.cwe || finding.cve) && (
            <div className="flex items-center gap-3">
              {finding.cwe && (
                <a
                  href={`https://cwe.mitre.org/data/definitions/${finding.cwe.replace("CWE-", "")}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  {finding.cwe}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {finding.cve && (
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${finding.cve}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  {finding.cve}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Description */}
          {finding.description && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">
                Description
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {finding.description}
              </p>
            </div>
          )}

          {/* Remediation */}
          {finding.remediation && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-1">
                Remediation
              </p>
              <p className="text-sm text-green-800 whitespace-pre-line">{finding.remediation}</p>
            </div>
          )}

          {/* References */}
          {finding.references && finding.references.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1.5">
                References
              </p>
              <ul className="space-y-1">
                {finding.references.map((ref) => (
                  <li key={ref}>
                    <a
                      href={ref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline break-all"
                    >
                      <span className="break-all">{ref}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Found at */}
          <p className="text-xs text-slate-400">
            Found:{" "}
            {new Date(finding.foundAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
    </div>
  );
}

export default function FindingsPage() {
  const params = useParams();
  const appId = params.id as string;
  const tagId = params.tagId as string;
  const scanId = params.scanId as string;

  const { application: app } = useApplication(appId);
  const imageTag = app?.imageTags.find((t) => t.id === tagId);
  const scan = imageTag?.scans.find((s) => s.id === scanId);

  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Real findings for this specific scan.
  const { findings: mockFindings, reload } = useScanFindings(scanId);
  const { me } = useMe();
  const canManage = !!me?.permissions.includes("manage_findings");

  function handleStatusChanged() {
    reload();
  }

  const filteredFindings = mockFindings.filter((f) => {
    const matchSeverity =
      severityFilter === "all" || f.severity === severityFilter;
    const matchStatus =
      statusFilter === "all" || f.status === statusFilter;
    return matchSeverity && matchStatus;
  });

  const counts = {
    all: mockFindings.length,
    open: mockFindings.filter((f) => f.status === "open").length,
    mitigated: mockFindings.filter((f) => f.status === "mitigated").length,
    false_positive: mockFindings.filter((f) => f.status === "false_positive").length,
    accepted: mockFindings.filter((f) => f.status === "accepted").length,
  };

  const severityCounts = {
    critical: mockFindings.filter((f) => f.severity === "critical").length,
    high: mockFindings.filter((f) => f.severity === "high").length,
    medium: mockFindings.filter((f) => f.severity === "medium").length,
    low: mockFindings.filter((f) => f.severity === "low").length,
    info: mockFindings.filter((f) => f.severity === "info").length,
  };

  const scanTotal = mockFindings.length;
  const scanResolved = mockFindings.filter(
    (f) => f.status === "mitigated" || f.status === "false_positive" || f.status === "accepted",
  ).length;
  const scanResolvedPct = scanTotal ? Math.round((100 * scanResolved) / scanTotal) : 0;

  return (
    <div>
      <Header
        title={`${app?.name || "App"} › ${imageTag?.tag || "Tag"} › ${scan?.scanner || "Scanner"}`}
        subtitle={`${scan?.scanType} · ${scan?.format} format`}
      />

      <div className="p-6 space-y-4">
        <Link
          href={`/dashboard/applications/${appId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {app?.name || "application"}
        </Link>

        {/* Scan summary */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-500">Scanner</p>
                  <p className="font-semibold text-slate-800">
                    {scan?.scanner}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Type</p>
                  <p className="font-semibold text-slate-800">
                    {scan?.scanType}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Scanned</p>
                  <p className="font-semibold text-slate-800">
                    {scan
                      ? new Date(scan.scannedAt).toLocaleDateString()
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Findings</p>
                  <p className="font-semibold text-slate-800">
                    {mockFindings.length}
                  </p>
                </div>
                <div className="w-32">
                  <p className="text-xs text-slate-500">Resolved</p>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-800">
                      {scanResolvedPct}%
                    </p>
                    <span className="text-xs text-slate-400">
                      ({scanResolved}/{scanTotal})
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${scanResolvedPct}%` }}
                    />
                  </div>
                </div>
              </div>
              <SeverityCounts
                critical={severityCounts.critical}
                high={severityCounts.high}
                medium={severityCounts.medium}
                low={severityCounts.low}
                info={severityCounts.info}
              />
            </div>
          </CardContent>
        </Card>

        {/* Findings */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Findings
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v ?? "all")}>
                  <SelectTrigger className="h-8 w-32 text-xs border-slate-200">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                  <SelectTrigger className="h-8 w-32 text-xs border-slate-200">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="mitigated">Mitigated</SelectItem>
                    <SelectItem value="false_positive">False Positive</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>

          <Tabs defaultValue="all" className="w-full">
            <div className="px-5 border-b border-slate-100">
              <TabsList className="h-9 bg-transparent p-0 gap-1">
                {(
                  [
                    ["all", "All", counts.all],
                    ["open", "Open", counts.open],
                    ["mitigated", "Mitigated", counts.mitigated],
                    ["accepted", "Accepted", counts.accepted],
                    ["false_positive", "False Positive", counts.false_positive],
                  ] as const
                ).map(([value, label, count]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-xs h-9 rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent px-3"
                    onClick={() =>
                      setStatusFilter(value === "all" ? "all" : value)
                    }
                  >
                    {label}
                    <span className="ml-1.5 text-[10px] bg-slate-100 px-1.5 py-0.5 rounded-full text-slate-500">
                      {count}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="all" className="m-0">
              <div>
                {filteredFindings.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    No findings match the selected filters.
                  </div>
                ) : (
                  filteredFindings.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      expanded={expandedId === finding.id}
                      onToggle={() =>
                        setExpandedId((id) => (id === finding.id ? null : finding.id))
                      }
                      canManage={canManage}
                      onChanged={handleStatusChanged}
                    />
                  ))
                )}
              </div>
            </TabsContent>
            {/* Other tabs share the same filtered content */}
            {["open", "mitigated", "accepted", "false_positive"].map((tab) => (
              <TabsContent key={tab} value={tab} className="m-0">
                <div>
                  {filteredFindings.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm">
                      No findings match the selected filters.
                    </div>
                  ) : (
                    filteredFindings.map((finding) => (
                      <FindingRow
                        key={finding.id}
                        finding={finding}
                        expanded={expandedId === finding.id}
                        onToggle={() =>
                          setExpandedId((id) => (id === finding.id ? null : finding.id))
                        }
                        canManage={canManage}
                        onChanged={handleStatusChanged}
                      />
                    ))
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
