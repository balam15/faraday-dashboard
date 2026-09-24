"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaybankLogo } from "@/components/ui/maybank-logo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Eye, EyeOff, Loader2, ShieldCheck,
  User, Mail, Lock, CheckCircle2,
} from "lucide-react";

const requirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Contains number", test: (p: string) => /[0-9]/.test(p) },
];

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirm: "",
    email: "",
    display_name: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const passwordOk = requirements.every((r) => r.test(form.password));
  const allValid =
    form.username.length >= 3 && passwordOk && form.password === form.confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/system/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          email: form.email || null,
          display_name: form.display_name || form.username,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Setup failed");
        return;
      }

      // The backend set the session cookie; go straight to the dashboard.
      router.push("/dashboard");
    } catch {
      setError("Could not connect to server");
    } finally {
      setLoading(false);
    }
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

      <div className="relative w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1.5 bg-[#FFC70A]" />

          <div className="px-8 py-8">
            <div className="mb-7">
              <MaybankLogo width={100} height={27} color="#000" className="mb-4" />
              <div className="flex items-center gap-2.5 mb-2">
                <div className="p-2 bg-blue-50 rounded-xl">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800">Initial Setup</h1>
                  <p className="text-xs text-slate-400">Faraday Dashboard · First Run</p>
                </div>
              </div>
              <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                Welcome! Create your administrator account to get started.
                This account will have full access to all features.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Username <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    value={form.username}
                    onChange={set("username")}
                    placeholder="admin"
                    className="pl-9 h-11 border-slate-200 bg-slate-50 focus:bg-white"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              {/* Display name */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Display Name
                </Label>
                <Input
                  value={form.display_name}
                  onChange={set("display_name")}
                  placeholder="Administrator"
                  className="h-11 border-slate-200 bg-slate-50 focus:bg-white"
                  disabled={loading}
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="admin@maybank.com"
                    className="pl-9 h-11 border-slate-200 bg-slate-50 focus:bg-white"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={set("password")}
                    placeholder="Minimum 8 characters"
                    className="pl-9 pr-10 h-11 border-slate-200 bg-slate-50 focus:bg-white"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Password requirements */}
                {form.password && (
                  <div className="space-y-1 pt-1">
                    {requirements.map((r) => (
                      <div key={r.label} className="flex items-center gap-1.5">
                        <CheckCircle2
                          className={`h-3.5 w-3.5 ${
                            r.test(form.password) ? "text-green-500" : "text-slate-300"
                          }`}
                        />
                        <span
                          className={`text-xs ${
                            r.test(form.password) ? "text-green-600" : "text-slate-400"
                          }`}
                        >
                          {r.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-600">
                  Confirm Password <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    type="password"
                    value={form.confirm}
                    onChange={set("confirm")}
                    placeholder="Repeat your password"
                    className={`pl-9 h-11 border-slate-200 bg-slate-50 focus:bg-white ${
                      form.confirm && form.confirm !== form.password
                        ? "border-red-300 focus:border-red-400"
                        : ""
                    }`}
                    disabled={loading}
                    required
                  />
                </div>
                {form.confirm && form.confirm !== form.password && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!allValid || loading}
                className="w-full h-11 mt-2 bg-[#FFC70A] hover:bg-[#f0bb00] disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/20"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Admin Account"
                )}
              </button>
            </form>
          </div>

          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-center text-slate-400">
              After setup, you can add LDAP/AD authentication in Settings
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Faraday Dashboard v1.0.0
        </p>
      </div>
    </div>
  );
}
