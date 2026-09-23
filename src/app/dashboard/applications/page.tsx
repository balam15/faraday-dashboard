"use client";

import Link from "next/link";
import { useState } from "react";
import { getRiskBadgeClass } from "@/lib/mock-data";
import { useApplications } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function ApplicationsPage() {
  const { applications: mockApplications, reload } = useApplications();
  const [importOpen, setImportOpen] = useState(false);
  const sortedApps = [...mockApplications].sort(
    (a, b) => b.riskScore - a.riskScore
  );

  return (
    <div>
      <Header
        title="Applications"
        subtitle={`${mockApplications.length} applications`}
      />

      <div className="p-6 space-y-3">
        <div className="flex justify-end">
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            Import Scan
          </button>
        </div>

        <ImportScanDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={reload}
        />

        {sortedApps.map((app) => {
          const TypeIcon = typeIcons[app.type];
          const totalScans = app.imageTags.reduce(
            (acc, tag) => acc + tag.scans.length,
            0
          );
          const totalTags = app.imageTags.length;

          return (
            <Link key={app.id} href={`/dashboard/applications/${app.id}`}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    {/* App icon */}
                    <div className="p-3 bg-slate-100 rounded-xl group-hover:bg-slate-200 transition-colors flex-shrink-0">
                      <TypeIcon className="h-5 w-5 text-slate-600" />
                    </div>

                    {/* App info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {app.name}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize border ${
                            typeColors[app.type]
                          }`}
                        >
                          {app.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-500 truncate">
                        {app.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Tag className="h-3 w-3" />
                          {totalTags} image tag{totalTags !== 1 ? "s" : ""}
                        </span>
                        <span className="text-slate-200">|</span>
                        <span className="text-xs text-slate-400">
                          {totalScans} scan{totalScans !== 1 ? "s" : ""}
                        </span>
                        <span className="text-slate-200">|</span>
                        <span className="text-xs text-slate-400">
                          Team: {app.team}
                        </span>
                        <span className="text-slate-200">|</span>
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Clock className="h-3 w-3" />
                          {formatDate(app.lastScanned)}
                        </span>
                      </div>
                    </div>

                    {/* Findings */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <SeverityCounts
                        critical={app.totalFindings.critical}
                        high={app.totalFindings.high}
                        medium={app.totalFindings.medium}
                        low={app.totalFindings.low}
                        info={app.totalFindings.info}
                      />

                      {/* Risk score */}
                      <div className="text-center">
                        <div
                          className={`text-sm font-bold px-2.5 py-1 rounded-lg ${getRiskBadgeClass(
                            app.riskScore
                          )}`}
                        >
                          {app.riskScore}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          risk
                        </p>
                      </div>

                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
