"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [examDate, setExamDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Pre-fill from user profile
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setTargetRole(user.target_role || "");
      setTargetCompany(user.target_company || "");
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    setSaved(false);
    try {
      await authApi.updateProfile({
        full_name: fullName || undefined,
        target_role: targetRole || undefined,
        target_company: targetCompany || undefined,
        exam_date: examDate || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chalk">
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <LayoutWrapper>
      <div className="max-w-[620px] mx-auto">
        <div className="stamp-id mb-2">DOC-06 · PROFILE</div>
        <h1 className="font-display text-[32px] tracking-tight mb-8 text-ink font-medium">Settings</h1>

        <StampCard id="PROFILE · YOU">
          <form onSubmit={handleSave} className="space-y-5">
            <Field
              label="FULL NAME"
              value={fullName}
              onChange={setFullName}
              placeholder="Your name"
            />
            <Field
              label="TARGET ROLE"
              value={targetRole}
              onChange={setTargetRole}
              placeholder="e.g. SDE Intern, Backend L4"
            />
            <Field
              label="TARGET COMPANY"
              value={targetCompany}
              onChange={setTargetCompany}
              placeholder="e.g. Microsoft, Google"
            />
            <Field
              label="EXAM DATE"
              value={examDate}
              onChange={setExamDate}
              placeholder="YYYY-MM-DD"
              mono
            />

            <div className="pt-2 border-t border-line">
              <div className="stamp-id mb-3">ACCOUNT</div>
              <div className="flex items-center gap-3 mb-1">
                <span className="stamp-id">EMAIL</span>
                <span className="font-mono text-[13px] text-ink/70">{user.email}</span>
              </div>
            </div>

            {error && (
              <p className="stamp-id text-rust font-bold">{error}</p>
            )}

            {saved && (
              <div className="flex items-center gap-2 stamp-id text-mastery font-bold">
                <CheckCircle2 size={13} />
                PROFILE SAVED SUCCESSFULLY
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full h-11 bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 rounded-sm disabled:opacity-60 cursor-pointer transition-colors flex items-center justify-center gap-2 font-display"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save profile"
              )}
            </button>
          </form>
        </StampCard>

        {/* Stats section */}
        <div className="mt-6 stamp-card p-5 bg-chalk/60">
          <div className="stamp-id mb-4">SESSION · STATS</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "JOINED", value: "ACTIVE" },
              { label: "PLAN", value: "FREE" },
              { label: "STATUS", value: "READY" },
            ].map((s) => (
              <div key={s.label}>
                <div className="stamp-id mb-1">{s.label}</div>
                <div className="font-mono text-[14px] text-ink font-bold">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="stamp-id block mb-1.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "w-full h-10 px-3 bg-chalk border border-line focus:border-blueprint focus:outline-none text-[14px] transition-colors " +
          (mono ? "font-mono" : "font-display")
        }
      />
    </label>
  );
}
