// Shared types and presentation helpers for scan data.
// (Data now comes from the backend via src/lib/api.ts; this file keeps the
// type contract the UI is built around, plus pure color/label helpers.)

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  scanner: string;
  scanType: string;
  filePath?: string;
  lineNumber?: number;
  cwe?: string;
  cve?: string;
  description: string;
  remediation?: string;
  status: "open" | "mitigated" | "false_positive" | "accepted";
  foundAt: string;
}

export interface ScanResult {
  id: string;
  scanner: string;
  scanType: "SAST" | "DAST" | "Image Scan" | "SCA" | "Secrets";
  format: string;
  scannedAt: string;
  findings: SeverityCount;
  status: "completed" | "running" | "failed";
}

export interface ImageTag {
  id: string;
  tag: string;
  digest?: string;
  createdAt: string;
  scans: ScanResult[];
  totalFindings: SeverityCount;
  riskScore: number;
}

export interface Application {
  id: string;
  name: string;
  description: string;
  team: string;
  type: "web" | "api" | "mobile" | "service";
  imageTags: ImageTag[];
  lastScanned: string;
  riskScore: number;
  totalFindings: SeverityCount;
}

export function emptySeverityCount(): SeverityCount {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function getTotalFindings(apps: Application[]): SeverityCount {
  return apps.reduce(
    (acc, app) => ({
      critical: acc.critical + app.totalFindings.critical,
      high: acc.high + app.totalFindings.high,
      medium: acc.medium + app.totalFindings.medium,
      low: acc.low + app.totalFindings.low,
      info: acc.info + app.totalFindings.info,
    }),
    emptySeverityCount(),
  );
}

export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case "critical": return "bg-red-500";
    case "high": return "bg-orange-500";
    case "medium": return "bg-yellow-500";
    case "low": return "bg-blue-500";
    case "info": return "bg-gray-400";
  }
}

export function getSeverityBadgeClass(severity: Severity): string {
  switch (severity) {
    case "critical": return "bg-red-100 text-red-700 border-red-200";
    case "high": return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "low": return "bg-blue-100 text-blue-700 border-blue-200";
    case "info": return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

export function getRiskBadgeClass(score: number): string {
  if (score >= 75) return "bg-red-100 text-red-700";
  if (score >= 50) return "bg-orange-100 text-orange-700";
  if (score >= 25) return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
}
