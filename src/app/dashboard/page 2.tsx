"use client";

import { getTotalFindings } from "@/lib/mock-data";
import { useApplications, useFindings } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SeverityCounts } from "@/components/ui/severity-badge";
import {
  AlertTriangle,
  ShieldCheck,
  AppWindow,
  ScanLine,
  TrendingDown,
  Clock,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const SEVERITY_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#94a3b8",
};

export default function DashboardPage() {
  const { applications: mockApplications } = useApplications();
  const { findings: allFindings } = useFindings();
  const totals = getTotalFindings(mockApplications);
  const mitigatedCount = allFindings.filter(
    (f) => f.status === "mitigated" || f.status === "accepted",
  ).length;
  const openCount = allFindings.filter((f) => f.status === "open").length;
  const totalFindings =
    totals.critical + totals.high + totals.medium + totals.low + totals.info;
  const criticalHighCount = totals.critical + totals.high;

  const appsWithCritical = mockApplications.filter(
    (a) => a.totalFindings.critical > 0
  ).length;

  // Bar chart data
  const barData = mockApplications.map((app) => ({
    name: app.name.split("-")[0],
    Critical: app.totalFindings.critical,
    High: app.totalFindings.high,
    Medium: app.totalFindings.medium,
    Low: app.totalFindings.low,
  }));

  // Pie chart data
  const pieData = [
    { name: "Critical", value: totals.critical, color: SEVERITY_COLORS.critical },
    { name: "High", value: totals.high, color: SEVERITY_COLORS.high },
    { name: "Medium", value: totals.medium, color: SEVERITY_COLORS.medium },
    { name: "Low", value: totals.low, color: SEVERITY_COLORS.low },
    { name: "Info", value: totals.info, color: SEVERITY_COLORS.info },
  ].filter((d) => d.value > 0);

  // Sort apps by risk
  const topRiskyApps = [...mockApplications]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 4);

  // Recent scans (flatten all scans)
  const recentScans = mockApplications
    .flatMap((app) =>
      app.imageTags.flatMap((tag) =>
        tag.scans.map((scan) => ({
          ...scan,
          appName: app.name,
          tagName: tag.tag,
        }))
      )
    )
    .sort(
      (a, b) =>
        new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    )
    .slice(0, 5);

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Security scanning overview"
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Total Findings
                  </p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">
                    {totalFindings}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    across all apps
                  </p>
                </div>
                <div className="p-2.5 bg-blue-50 rounded-xl">
                  <ScanLine className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Critical + High
                  </p>
                  <p className="text-3xl font-bold text-red-600 mt-1">
                    {criticalHighCount}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    need immediate action
                  </p>
                </div>
                <div className="p-2.5 bg-red-50 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Applications
                  </p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">
                    {mockApplications.length}
                  </p>
                  <p className="text-xs text-red-500 mt-1">
                    {appsWithCritical} with critical issues
                  </p>
                </div>
                <div className="p-2.5 bg-purple-50 rounded-xl">
                  <AppWindow className="h-5 w-5 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">
                    Mitigated
                  </p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {mitigatedCount}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    mitigated or accepted
                  </p>
                </div>
                <div className="p-2.5 bg-green-50 rounded-xl">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Bar chart */}
          <Card className="col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Findings by Application
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} barSize={14} barGap={2}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f1f5f9"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
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
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="Critical" fill={SEVERITY_COLORS.critical} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="High" fill={SEVERITY_COLORS.high} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Medium" fill={SEVERITY_COLORS.medium} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Low" fill={SEVERITY_COLORS.low} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Pie chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 px-5 pt-5">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Severity Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "none",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Top risky apps */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 px-5 pt-5 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Highest Risk Applications
              </CardTitle>
              <Link
                href="/dashboard/applications"
                className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
              >
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-4">
              {topRiskyApps.map((app) => (
                <div key={app.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <Link
                      href={`/dashboard/applications/${app.id}`}
                      className="text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                    >
                      {app.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <SeverityCounts
                        critical={app.totalFindings.critical}
                        high={app.totalFindings.high}
                        medium={app.totalFindings.medium}
                        low={app.totalFindings.low}
                        compact
                      />
                      <span
                        className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          app.riskScore >= 75
                            ? "bg-red-100 text-red-700"
                            : app.riskScore >= 50
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {app.riskScore}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={app.riskScore}
                    className="h-1.5 bg-slate-100"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent scans */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 px-5 pt-5 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-slate-700">
                Recent Scans
              </CardTitle>
              <Clock className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {scan.appName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {scan.scanner} · {scan.tagName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-slate-200"
                    >
                      {scan.scanType}
                    </Badge>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        scan.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : scan.status === "running"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {scan.status}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Severity summary bar */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">
                Overall Severity Breakdown
              </p>
              <div className="flex items-center gap-1">
                <TrendingDown className="h-4 w-4 text-green-500" />
                <span className="text-xs text-green-600">
                  {openCount} open · {mitigatedCount} resolved
                </span>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {pieData.map((item) => (
                <div
                  key={item.name}
                  style={{
                    width: `${(item.value / totalFindings) * 100}%`,
                    backgroundColor: item.color,
                  }}
                  title={`${item.name}: ${item.value}`}
                  className="transition-all"
                />
              ))}
            </div>
            <div className="flex items-center gap-4 mt-3">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs text-slate-600">
                    {item.name}:{" "}
                    <span className="font-semibold">{item.value}</span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
