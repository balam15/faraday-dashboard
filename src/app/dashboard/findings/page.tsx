"use client";

import { useState } from "react";
import { type Finding } from "@/lib/mock-data";
import { useFindings, useMe, updateFindingStatus } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/ui/severity-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldX,
  Info,
  FileCode2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

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

function FindingDetail({
  finding,
  open,
  onClose,
  canManage,
  onChanged,
}: {
  finding: Finding | null;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  onChanged: (status: Finding["status"]) => void;
}) {
  if (!finding) return null;
  const status = statusConfig[finding.status];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-slate-800 pr-4">
            {finding.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
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
          {finding.filePath && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-xs font-medium text-slate-500 mb-1">Location</p>
              <p className="font-mono text-sm text-slate-700">
                {finding.filePath}
                {finding.lineNumber && (
                  <span className="text-blue-600">:{finding.lineNumber}</span>
                )}
              </p>
            </div>
          )}
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
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1.5">Description</p>
            <p className="text-sm text-slate-700 leading-relaxed">{finding.description}</p>
          </div>
          {finding.remediation && (
            <div className="bg-green-50 border border-green-100 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Remediation</p>
              <p className="text-sm text-green-800">{finding.remediation}</p>
            </div>
          )}
          <p className="text-xs text-slate-400">
            Found:{" "}
            {new Date(finding.foundAt).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FindingsPage() {
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scannerFilter, setScannerFilter] = useState("all");
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { findings: mockFindings, reload } = useFindings();
  const { me } = useMe();
  const canManage = !!me?.permissions.includes("manage_findings");

  function handleStatusChanged(next: Finding["status"]) {
    setSelectedFinding((f) => (f ? { ...f, status: next } : f));
    reload();
  }

  const scanners = Array.from(new Set(mockFindings.map((f) => f.scanner)));

  const filtered = mockFindings.filter((f) => {
    return (
      (severityFilter === "all" || f.severity === severityFilter) &&
      (statusFilter === "all" || f.status === statusFilter) &&
      (scannerFilter === "all" || f.scanner === scannerFilter)
    );
  });

  const severityCounts = {
    critical: mockFindings.filter((f) => f.severity === "critical").length,
    high: mockFindings.filter((f) => f.severity === "high").length,
    medium: mockFindings.filter((f) => f.severity === "medium").length,
    low: mockFindings.filter((f) => f.severity === "low").length,
  };

  return (
    <div>
      <Header
        title="Findings"
        subtitle={`${mockFindings.length} total findings across all applications`}
      />
      <div className="p-6 space-y-4">
        {/* Summary chips */}
        <div className="flex items-center gap-3">
          {[
            { label: "Critical", count: severityCounts.critical, color: "bg-red-100 text-red-700 border-red-200" },
            { label: "High", count: severityCounts.high, color: "bg-orange-100 text-orange-700 border-orange-200" },
            { label: "Medium", count: severityCounts.medium, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
            { label: "Low", count: severityCounts.low, color: "bg-blue-100 text-blue-700 border-blue-200" },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() =>
                setSeverityFilter(
                  severityFilter === item.label.toLowerCase()
                    ? "all"
                    : item.label.toLowerCase()
                )
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${item.color} ${
                severityFilter === item.label.toLowerCase()
                  ? "ring-2 ring-offset-1 ring-current opacity-100"
                  : "opacity-80 hover:opacity-100"
              }`}
            >
              {item.label}
              <span className="font-bold">{item.count}</span>
            </button>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">
                {filtered.length} findings
                {severityFilter !== "all" && ` · ${severityFilter}`}
                {statusFilter !== "all" && ` · ${statusFilter}`}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={scannerFilter} onValueChange={(v) => setScannerFilter(v ?? "all")}>
                  <SelectTrigger className="h-8 w-36 text-xs border-slate-200">
                    <SelectValue placeholder="Scanner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scanners</SelectItem>
                    {scanners.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "all")}>
                  <SelectTrigger className="h-8 w-36 text-xs border-slate-200">
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
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No findings match the selected filters.
              </div>
            ) : (
              filtered.map((finding) => {
                const status = statusConfig[finding.status];
                const StatusIcon = status.icon;
                return (
                  <button
                    key={finding.id}
                    onClick={() => {
                      setSelectedFinding(finding);
                      setDialogOpen(true);
                    }}
                    className="w-full text-left flex items-start gap-3 px-5 py-4 border-b border-slate-50 hover:bg-slate-50 transition-colors group"
                  >
                    <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${status.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                        {finding.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-400">{finding.scanner}</span>
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <SeverityBadge severity={finding.severity} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${status.badge}`}>
                        {status.label}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500" />
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <FindingDetail
        finding={selectedFinding}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        canManage={canManage}
        onChanged={handleStatusChanged}
      />
    </div>
  );
}
