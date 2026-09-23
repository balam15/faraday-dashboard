import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { generateReportPDF } from "@/lib/pdf-report";
import type { Application, Finding } from "@/lib/mock-data";

// Backend base URL (server-to-server; not exposed to the browser).
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ appId: string; tagId: string }> }
) {
  const { appId, tagId } = await params;

  // Forward the caller's session cookie so the backend enforces access.
  const cookie = req.headers.get("cookie") ?? "";
  const authHeaders = { cookie };

  const appRes = await fetch(`${BACKEND_URL}/api/apps/${appId}`, { headers: authHeaders });
  if (appRes.status === 401) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!appRes.ok) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
  const app: Application = await appRes.json();

  const imageTag = app.imageTags.find((t) => t.id === tagId);
  if (!imageTag) {
    return NextResponse.json({ error: "Image tag not found" }, { status: 404 });
  }

  const findingsRes = await fetch(`${BACKEND_URL}/api/tags/${tagId}/findings`, { headers: authHeaders });
  const mockFindings: Finding[] = findingsRes.ok ? await findingsRes.json() : [];

  const reportData = {
    appName: app.name,
    appDescription: app.description,
    imageTag: imageTag.tag,
    imageDigest: imageTag.digest,
    scanDate: imageTag.createdAt,
    reportGeneratedAt: new Date().toISOString(),
    riskScore: imageTag.riskScore,
    scans: imageTag.scans.map((s) => ({
      scanner: s.scanner,
      scanType: s.scanType,
      scannedAt: s.scannedAt,
      findings: s.findings,
    })),
    findings: mockFindings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      scanner: f.scanner,
      scanType: f.scanType,
      filePath: f.filePath,
      lineNumber: f.lineNumber,
      cwe: f.cwe,
      cve: f.cve,
      description: f.description,
      remediation: f.remediation,
      status: f.status,
      foundAt: f.foundAt,
    })),
  };

  const pdfDoc = generateReportPDF(reportData);
  const buffer = await renderToBuffer(pdfDoc);
  const uint8 = new Uint8Array(buffer);

  const filename = `faraday-report-${app.name}-${imageTag.tag}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(uint8, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(uint8.byteLength),
    },
  });
}
