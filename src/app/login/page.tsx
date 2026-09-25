"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MaybankLogo } from "@/components/ui/maybank-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  // On mount: check if first-run or already logged in
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch("/api/system/status");
        const data = await res.json();
        if (data.first_run) {
          router.replace("/setup");
          return;
        }
        // Already authenticated? The session lives in an httpOnly cookie,
        // sent automatically with this same-origin request.
        const me = await fetch("/api/auth/me", { credentials: "include" });
        if (me.ok) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        // API not reachable — proceed to login form (dev mode)
      } finally {
        setChecking(false);
      }
    }
    checkStatus();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Invalid credentials");
        return;
      }

      // The backend set the session as an httpOnly cookie; just navigate.
      router.push("/dashboard");
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-[#FFC70A]" />

          <div className="px-8 py-8">
            {/* Logo + title */}
            <div className="mb-7">
              <MaybankLogo width={150} height={41} color="#000" className="mb-4" />
              <h1 className="text-xl font-bold text-slate-800">InfraShield Dashboard</h1>
              <p className="text-sm text-slate-400 mt-0.5">Security Scanning Platform</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Username
                </Label>
                <Input
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 border-slate-200 focus:border-yellow-400 bg-slate-50 focus:bg-white transition-colors"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10 border-slate-200 focus:border-yellow-400 bg-slate-50 focus:bg-white transition-colors"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-1 bg-[#FFC70A] hover:bg-[#f0bb00] disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>
          </div>

          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-center text-slate-400">
              Local or Active Directory account · Contact admin for access
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          InfraShield Dashboard v1.0.0
        </p>
      </div>
    </div>
  );
}
