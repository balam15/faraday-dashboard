"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadCloud, Loader2, CheckCircle2 } from "lucide-react";
import { importScan, useScanTypes } from "@/lib/api";

interface ImportScanDialogProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

export function ImportScanDialog({ open, onClose, onImported }: ImportScanDialogProps) {
  const { scanTypes } = useScanTypes();
  const fileRef = useRef<HTMLInputElement>(null);
  const [appName, setAppName] = useState("");
  const [tag, setTag] = useState("");
  const [scanType, setScanType] = useState("");
  const [digest, setDigest] = useState("");
  const [team, setTeam] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const canSubmit = Boolean(file && appName.trim() && tag.trim() && scanType);

  function reset() {
    setAppName("");
    setTag("");
    setScanType("");
    setDigest("");
    setTeam("");
    setFile(null);
    setError("");
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit() {
    if (!canSubmit || !file) return;
    setLoading(true);
    setError("");
    try {
      const res = await importScan({
        file,
        appName: appName.trim(),
        tag: tag.trim(),
        scanType,
        digest: digest.trim() || undefined,
        team: team.trim() || undefined,
      });
      setDone(`Imported ${res.findings} findings from ${res.scanner}.`);
      onImported?.();
      setTimeout(() => {
        reset();
        onClose();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <UploadCloud className="h-5 w-5 text-blue-600" />
            Import Scan Result
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* File */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-600">Scan file</Label>
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <p className="text-xs text-slate-400">
              Trivy JSON, ZAP XML, SARIF, or Fortify FPR.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Application</Label>
              <Input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="payment-service"
                className="border-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Image tag</Label>
              <Input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="v2.4.1"
                className="border-slate-200 font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">Scanner type</Label>
              <Select value={scanType} onValueChange={(v) => setScanType(v ?? "")}>
                <SelectTrigger className="border-slate-200">
                  <SelectValue placeholder="Select scanner" />
                </SelectTrigger>
                <SelectContent>
                  {scanTypes.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-600">
                Team <span className="text-slate-400 font-normal">(optional)</span>
              </Label>
              <Input
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                placeholder="Platform"
                className="border-slate-200"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-600">
              Image digest <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              value={digest}
              onChange={(e) => setDigest(e.target.value)}
              placeholder="sha256:..."
              className="border-slate-200 font-mono text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
          {done && (
            <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              {done}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="h-4 w-4" />
              )}
              {loading ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
