"use client";

import { useCallback, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true (default) → red destructive button; false → blue primary. */
  destructive?: boolean;
}

/**
 * In-app confirmation dialog. Usage:
 *
 *   const { confirm, ConfirmModal } = useConfirm();
 *   ...
 *   if (await confirm({ title: "Delete user?", message: "..." })) { ... }
 *   ...
 *   return (<div>...{ConfirmModal}</div>);
 */
export function useConfirm() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const isDestructive = opts.destructive !== false;

  const ConfirmModal = (
    <Dialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-800">
            {isDestructive && <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />}
            {opts.title ?? "Are you sure?"}
          </DialogTitle>
        </DialogHeader>
        {opts.message ? (
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">{opts.message}</p>
        ) : null}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => settle(false)}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {opts.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => settle(true)}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${
              isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {opts.confirmLabel ?? "Delete"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { confirm, ConfirmModal };
}
