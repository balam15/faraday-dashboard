"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  getRiskBadgeClass,
  type ScanResult,
} from "@/lib/mock-data";
import { useApplication, deleteApp, deleteTag } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SeverityCounts } from "@/components/ui/severity-badge";
import {
  ChevronRight,
  Tag,
  Clock,
  Hash,
  ScanLine,
  CheckCircle2,
  XCircle,
  Loader2,
  FileDown,
  Trash2,
  ArrowLeft,
} from "lucide-react";

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const scanTypeColor: Record<string, string> = {
  SAST: "bg-purple-100 text-purple-700 border-purple-200",
  DAST: "bg-blue-100 text-blue-700 border-blue-200",
  "Image Scan": "bg-cyan-100 text-cyan-700 border-cyan-200",
  SCA: "bg-green-100 text-green-700 border-green-200",
  Secrets: "bg-red-100 text-red-700 border-red-200",
};

const scannerIcons: Record<string, string> = {
  Trivy: "🔍",
  Fortify: "🛡️",
  "OWASP ZAP": "⚡",
  MegaLinter: "🔬",
};

function ScanStatusIcon({ status }: { status: ScanResult["status"] }) {
  if (status === "completed")
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (status === "failed")
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
}

function DownloadReportButton({
  appId,
  tagId,
  tagName,
}: {
  appId: string;
  tagId: string;
  tagName: string;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/report/${appId}/${tagId}`);
      if (!res.ok) throw new Error("Failed to generate report");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `faraday-report-${tagName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
    >
      {downloading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5" />
      )}
      {downloading ? "Generating..." : "Export PDF"}
    </button>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { application: app, loading, reload } = useApplication(params.id as string);

  async function handleDeleteApp() {
    if (!app) return;
    if (!confirm(`Delete application "${app.name}" and all its scans?`)) return;
    try {
      await deleteApp(app.id);
      router.push("/dashboard/applications");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete application");
    }
  }

  async function handleDeleteTag(tagId: string, tagName: string) {
    if (!confirm(`Delete image tag "${tagName}" and its scans?`)) return;
    try {
      await deleteTag(tagId);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete tag");
    }
  }

  if (loading) {
    return <div className="p-6" />;
  }

  if (!app) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Application not found.</p>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={app.name}
        subtitle={`${app.description} · Team: ${app.team}`}
      />

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard/applications"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Applications
          </Link>
          <button
            onClick={handleDeleteApp}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete Application
          </button>
        </div>

        {/* App summary */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Risk Score</p>
              <p
                className={`text-2xl font-bold ${
                  app.riskScore >= 75
                    ? "text-red-600"
                    : app.riskScore >= 50
                    ? "text-orange-600"
                    : app.riskScore >= 25
                    ? "text-yellow-600"
                    : "text-green-600"
                }`}
              >
                {app.riskScore}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Critical + High</p>
              <p className="text-2xl font-bold text-slate-800">
                {app.totalFindings.critical + app.totalFindings.high}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Image Tags</p>
              <p className="text-2xl font-bold text-slate-800">
                {app.imageTags.length}
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 mb-1">Last Scanned</p>
              <p className="text-sm font-semibold text-slate-700 mt-1">
                {new Date(app.lastScanned).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Image tags */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="px-5 pt-5 pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Tag className="h-4 w-4 text-slate-400" />
              Image Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {app.imageTags.map((imageTag, idx) => (
              <div
                key={imageTag.id}
                className="border border-slate-100 rounded-xl p-4 hover:border-slate-200 transition-colors bg-slate-50/50"
              >
                {/* Tag header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Tag className="h-4 w-4 text-blue-500" />
                        <span className="font-mono font-semibold text-slate-800">
                          {imageTag.tag}
                        </span>
                      </div>
                      {idx === 0 && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white border-0">
                          latest
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {imageTag.digest && (
                        <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
                          <Hash className="h-3 w-3" />
                          {imageTag.digest.slice(0, 20)}...
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {formatDate(imageTag.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <SeverityCounts
                      critical={imageTag.totalFindings.critical}
                      high={imageTag.totalFindings.high}
                      medium={imageTag.totalFindings.medium}
                      low={imageTag.totalFindings.low}
                      info={imageTag.totalFindings.info}
                    />
                    <span
                      className={`text-sm font-bold px-2 py-0.5 rounded-lg ${getRiskBadgeClass(
                        imageTag.riskScore
                      )}`}
                    >
                      {imageTag.riskScore}
                    </span>
                    {/* PDF Export button */}
                    <DownloadReportButton
                      appId={app.id}
                      tagId={imageTag.id}
                      tagName={imageTag.tag}
                    />
                    {/* Delete tag */}
                    <button
                      onClick={() => handleDeleteTag(imageTag.id, imageTag.tag)}
                      className="flex items-center justify-center h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete this image tag"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Scans table */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-2">
                    <ScanLine className="h-3.5 w-3.5" />
                    Scan Results
                  </p>
                  {imageTag.scans.map((scan) => (
                    <Link
                      key={scan.id}
                      href={`/dashboard/applications/${app.id}/tags/${imageTag.id}/scans/${scan.id}`}
                      className="flex items-center gap-3 bg-white rounded-lg px-4 py-3 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all group"
                    >
                      <span className="text-lg">
                        {scannerIcons[scan.scanner] || "🔧"}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">
                            {scan.scanner}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 border ${
                              scanTypeColor[scan.scanType] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {scan.scanType}
                          </Badge>
                          <span className="text-[10px] text-slate-400">
                            {scan.format}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Scanned {formatDate(scan.scannedAt)}
                        </p>
                      </div>
                      <SeverityCounts
                        critical={scan.findings.critical}
                        high={scan.findings.high}
                        medium={scan.findings.medium}
                        low={scan.findings.low}
                        info={scan.findings.info}
                      />
                      <div className="flex items-center gap-1.5 ml-2">
                        <ScanStatusIcon status={scan.status} />
                        <span className="text-xs text-slate-500 capitalize">
                          {scan.status}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 ml-1 transition-colors" />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
