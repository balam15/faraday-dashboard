"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/api";
import {
  LayoutDashboard,
  AppWindow,
  Bug,
  Users,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { MaybankLogo } from "@/components/ui/maybank-logo";

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Applications",
    href: "/dashboard/applications",
    icon: AppWindow,
  },
  {
    title: "Findings",
    href: "/dashboard/findings",
    icon: Bug,
  },
];

const adminItems = [
  {
    title: "Roles",
    href: "/dashboard/roles",
    icon: Users,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  security_engineer: "Security Engineer",
  developer: "Developer",
  viewer: "Viewer",
};

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    username: string;
    display_name?: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => {});
  }, []);

  const displayName = user?.display_name || user?.username || "";
  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : "";
  const initials =
    displayName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <div className="flex flex-col w-64 bg-slate-900 text-slate-100 h-screen fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="flex flex-col gap-2 px-5 py-4 border-b border-slate-700/50">
        <MaybankLogo width={150} height={41} color="#ffffff" />
        <div>
          <p className="font-semibold text-white text-sm leading-tight">
            InfraShield Dashboard
          </p>
          <p className="text-[11px] text-slate-400">Security Scanning</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Overview
        </p>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
              isActive(item.href)
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            )}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1">{item.title}</span>
            {isActive(item.href) && (
              <ChevronRight className="h-3.5 w-3.5 opacity-70" />
            )}
          </Link>
        ))}

        <div className="pt-3">
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Administration
          </p>
          {adminItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive(item.href)
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{item.title}</span>
              {isActive(item.href) && (
                <ChevronRight className="h-3.5 w-3.5 opacity-70" />
              )}
            </Link>
          ))}
        </div>
      </nav>

      <Separator className="bg-slate-700/50" />

      {/* User */}
      <div className="px-3 py-4">
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer group text-left"
          title="Sign out"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-600 text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {displayName || " "}
            </p>
            <p className="text-xs text-slate-400 truncate">{roleLabel}</p>
          </div>
          <LogOut className="h-4 w-4 text-slate-500 group-hover:text-slate-300 transition-colors flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}
