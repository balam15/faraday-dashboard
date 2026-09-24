"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Search,
  UploadCloud,
  UserCog,
  ShieldCheck,
  AppWindow,
  Activity as ActivityIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useActivity, type ActivityItem } from "@/lib/api";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const SEEN_KEY = "faraday_activity_seen";

function iconFor(kind: string) {
  switch (kind) {
    case "import": return UploadCloud;
    case "user": return UserCog;
    case "role": return ShieldCheck;
    case "application": return AppWindow;
    default: return ActivityIcon;
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { activity } = useActivity();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load last-seen marker (per browser).
  useEffect(() => {
    try {
      const v = localStorage.getItem(SEEN_KEY);
      setLastSeen(v ? Number(v) : 0);
    } catch {
      /* ignore */
    }
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = useMemo(
    () => activity.filter((a) => new Date(a.created_at).getTime() > lastSeen).length,
    [activity, lastSeen],
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Opening marks everything as seen.
      const now = Date.now();
      setLastSeen(now);
      try {
        localStorage.setItem(SEEN_KEY, String(now));
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <header className="h-16 border-b border-slate-200 bg-white flex items-center px-6 gap-4 sticky top-0 z-20">
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search..."
            className="pl-9 w-56 h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
          />
        </div>

        <div className="relative" ref={panelRef}>
          <button
            onClick={toggle}
            className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
            title="Activity"
          >
            <Bell className="h-5 w-5 text-slate-500" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[10px] font-semibold text-white bg-red-500">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-96 max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-2xl border border-slate-100 z-30">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Activity</p>
                <span className="text-xs text-slate-400">{activity.length} recent</span>
              </div>
              {activity.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  No activity yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {activity.map((a: ActivityItem) => {
                    const Icon = iconFor(a.kind);
                    return (
                      <li key={a.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 flex-shrink-0">
                          <Icon className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 leading-snug">{a.message}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {a.actor ? `${a.actor} · ` : ""}
                            {timeAgo(a.created_at)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
