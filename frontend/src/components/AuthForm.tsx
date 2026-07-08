"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/LayoutWrapper";

interface AuthFormProps {
  mode: "login" | "register";
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stamp-card p-8 w-full max-w-md mx-auto animate-fadeUp bg-background">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-8">
        <LogoMark />
        <span className="font-display text-[15px] font-medium tracking-tight text-foreground">PrepPilot</span>
      </div>

      <div className="stamp-id mb-1">
        {mode === "login" ? "DOC-AUTH-01 · SIGN IN" : "DOC-AUTH-02 · REGISTER"}
      </div>
      <h1 className="font-display text-[26px] font-semibold text-foreground mb-1">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-[13.5px] text-foreground/60 mb-8 leading-relaxed">
        {mode === "login"
          ? "Sign in to continue your prep session."
          : "Start practicing with AI-generated assessments."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {mode === "register" && (
          <div>
            <label className="stamp-id block mb-1.5">FULL NAME</label>
            <input
              id="fullName"
              type="text"
              placeholder="Alex Johnson"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-10 px-3 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
            />
          </div>
        )}

        <div>
          <label className="stamp-id block mb-1.5">EMAIL</label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-10 px-3 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
          />
        </div>

        <div>
          <label className="stamp-id block mb-1.5">PASSWORD</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full h-10 px-3 pr-10 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 border border-rust/30 stamp-id text-rust bg-rust/5">
            {error}
          </div>
        )}

        <button
          type="submit"
          id="auth-submit-btn"
          disabled={loading}
          className="w-full h-11 bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 disabled:opacity-60 cursor-pointer transition-colors flex items-center justify-center gap-2 font-display mt-1"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : mode === "login" ? (
            "Sign in"
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <div className="h-px bg-line my-6" />

      <p className="stamp-id text-center">
        {mode === "login" ? (
          <>
            NEW HERE?{" "}
            <Link href="/register" className="text-blueprint font-bold hover:underline">
              CREATE AN ACCOUNT
            </Link>
          </>
        ) : (
          <>
            ALREADY HAVE AN ACCOUNT?{" "}
            <Link href="/login" className="text-blueprint font-bold hover:underline">
              SIGN IN
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
