"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { sessionsApi } from "@/lib/api";
import { CountdownTimer } from "@/components/CountdownTimer";
import { MCQPanel } from "@/components/MCQPanel";
import { CodeEditor } from "@/components/CodeEditor";
import ReactMarkdown from "react-markdown";
import { AlertTriangle } from "lucide-react";

interface MCQQuestion {
  id: string;
  question: string;
  options: Record<string, string>;
  topic_tags: string[];
  difficulty: string;
}

interface CodingQuestion {
  id: string;
  title: string;
  statement: string;
  constraints?: string;
  sample_input?: string;
  sample_output?: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  topic_tags: string[];
  difficulty: string;
}

interface Question {
  order: number;
  question_type: "mcq" | "coding";
  mcq?: MCQQuestion;
  coding?: CodingQuestion;
}

interface SessionData {
  id: string;
  test_id: string;
  status: string;
  started_at: string;
  expires_at: string;
  questions: Question[];
}

export default function TestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answeredMCQs, setAnsweredMCQs] = useState<Set<string>>(new Set());
  const [solvedCoding, setSolvedCoding] = useState<Set<string>>(new Set());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Tab-switch warning
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && session?.status === "active") {
        setTabWarning(true);
        setTimeout(() => setTabWarning(false), 4000);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session]);

  // Load session
  useEffect(() => {
    if (!sessionId) return;
    sessionsApi.get(sessionId)
      .then((res) => {
        setSession(res.data);
        if (res.data.status === "submitted") setSubmitted(true);
      })
      .catch(() => setError("Session not found or you don't have access."))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleExpire = useCallback(() => {
    if (!submitted) handleFinalSubmit();
  }, [submitted]);

  const handleFinalSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setShowSubmitConfirm(false);
    try {
      await sessionsApi.submit(sessionId);
      setSubmitted(true);
      setTimeout(() => router.push(`/report/${sessionId}`), 1200);
    } catch {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="dark min-h-screen bg-graphite text-chalk flex flex-col items-center justify-center gap-3">
        <span className="spinner" style={{ borderColor: "rgba(236,234,228,0.15)", borderTopColor: "rgba(236,234,228,0.8)" }} />
        <p className="stamp-id text-chalk/50">LOADING ASSESSMENT SESSION…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark min-h-screen bg-graphite text-chalk flex flex-col items-center justify-center gap-4">
        <AlertTriangle size={28} className="text-rust" />
        <p className="font-display text-[16px] font-medium text-chalk">{error}</p>
        <button
          className="h-9 px-4 border border-chalk/20 text-[12px] font-mono text-chalk/70 hover:text-chalk hover:bg-chalk/5 cursor-pointer transition-colors"
          onClick={() => router.push("/dashboard")}
        >
          BACK TO DASHBOARD
        </button>
      </div>
    );
  }

  if (!session) return null;

  const questions = session.questions || [];
  const activeQ = questions[activeIdx];
  const isCoding = activeQ?.question_type === "coding";
  const disabled = submitted || session.status !== "active";
  const shortSessionId = `SES-${session.id.substring(0, 4).toUpperCase()}`;
  const completedCount = answeredMCQs.size + solvedCoding.size;
  const totalCount = questions.length;

  return (
    <div className="dark min-h-screen bg-graphite text-chalk font-sans flex flex-col select-none overflow-hidden" style={{ maxHeight: "100dvh" }}>

      {/* Tab-switch warning banner */}
      {tabWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-rust text-chalk py-2 text-center stamp-id flex items-center justify-center gap-2 animate-fadeUp">
          <AlertTriangle size={12} />
          TAB SWITCH DETECTED — STAY ON THIS PAGE DURING THE ASSESSMENT
        </div>
      )}

      {/* ── Top bar (matches canvas exactly) ── */}
      <header className="border-b border-chalk/10 h-14 flex items-center px-6 gap-6 flex-shrink-0">
        {/* Timer */}
        {session.expires_at && !submitted ? (
          <CountdownTimer expiresAt={session.expires_at} onExpire={handleExpire} />
        ) : (
          <div className="font-mono text-[22px] tabular-nums text-chalk/40">00:00:00</div>
        )}

        {/* Session stamp */}
        <div className="stamp-id text-chalk/60">
          SESSION {shortSessionId} · QUESTION {activeIdx + 1} OF {totalCount}
        </div>

        {/* Submit */}
        <div className="ml-auto flex items-center gap-2">
          {submitted ? (
            <span className="stamp-id text-mastery">SUBMITTED · REDIRECTING…</span>
          ) : (
            <button
              id="final-submit-btn"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submitting}
              className="h-9 px-4 border border-chalk/20 text-[13px] hover:bg-chalk/10 hover:border-chalk/40 grid place-items-center rounded-sm font-display cursor-pointer transition-colors text-chalk disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit test"}
            </button>
          )}
        </div>
      </header>

      {/* ── Question navigator (matches canvas exactly) ── */}
      <div className="border-b border-chalk/10 h-11 flex items-center px-6 gap-1 flex-shrink-0">
        {questions.map((qq, i) => {
          const isAnswered = qq.question_type === "mcq"
            ? qq.mcq && answeredMCQs.has(qq.mcq.id)
            : qq.coding && solvedCoding.has(qq.coding.id);
          const isActive = i === activeIdx;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={
                "h-7 px-2.5 font-mono text-[11px] flex items-center gap-2 border cursor-pointer transition-colors " +
                (isActive
                  ? "border-chalk text-chalk"
                  : "border-chalk/15 text-chalk/60 hover:text-chalk hover:border-chalk/40")
              }
            >
              <span>{qq.question_type === "mcq" ? "M" : "Q"}{String(i + 1).padStart(2, "0")}</span>
              <span
                className={
                  "inline-block h-1.5 w-1.5 " +
                  (isAnswered ? "bg-chalk" : "border border-chalk/30")
                }
              />
            </button>
          );
        })}
      </div>

      {/* ── Submit confirmation modal ── */}
      {showSubmitConfirm && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(27,30,35,0.88)", backdropFilter: "blur(4px)" }}
          className="flex items-center justify-center"
        >
          <div className="border border-chalk/15 p-8 max-w-[400px] w-[90%] text-center bg-graphite animate-fadeUp">
            <AlertTriangle size={28} className="text-rust mx-auto mb-4" />
            <h3 className="font-display text-[18px] text-chalk mb-2 font-medium">Submit test?</h3>
            <p className="text-[13.5px] text-chalk/70 leading-relaxed mb-6">
              You have completed <strong className="text-chalk">{completedCount}</strong> of <strong className="text-chalk">{totalCount}</strong> questions.
              Once submitted, you cannot return to this session.
            </p>
            <div className="flex gap-3">
              <button
                className="flex-1 h-10 border border-chalk/15 text-chalk text-[13px] font-mono hover:bg-chalk/5 cursor-pointer transition-colors"
                onClick={() => setShowSubmitConfirm(false)}
              >
                BACK
              </button>
              <button
                className="flex-1 h-10 bg-rust text-chalk text-[13px] font-mono hover:bg-rust/90 cursor-pointer transition-colors"
                onClick={handleFinalSubmit}
              >
                SUBMIT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main body (matches canvas grid) ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeQ ? (
          isCoding && activeQ.coding ? (
            /* ── Coding: split pane ── */
            <div className="h-full grid lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)]">
              {/* Left: Problem panel */}
              <div className="border-r border-chalk/10 overflow-y-auto p-8">
                <div className="stamp-id text-chalk/50 mb-3">
                  Q{activeIdx + 1} · {activeQ.coding.difficulty.toUpperCase()} · CODING
                </div>
                <h1 className="font-display text-[22px] leading-tight mb-4 text-chalk font-medium">
                  {activeQ.coding.title}
                </h1>

                <div className="text-[14px] text-chalk/80 leading-relaxed space-y-4 prose-dark">
                  <ReactMarkdown>{activeQ.coding.statement}</ReactMarkdown>

                  <div className="border border-chalk/15 p-4">
                    <div className="stamp-id text-chalk/50 mb-2">CONSTRAINTS</div>
                    <ul className="font-mono text-[12.5px] space-y-1 text-chalk/80">
                      <li>⏱ Time: {activeQ.coding.time_limit_ms}ms</li>
                      <li>💾 Memory: {activeQ.coding.memory_limit_mb}MB</li>
                      {activeQ.coding.constraints && (
                        <ReactMarkdown>{activeQ.coding.constraints}</ReactMarkdown>
                      )}
                    </ul>
                  </div>

                  {activeQ.coding.sample_input && (
                    <div className="border border-chalk/15 p-4">
                      <div className="stamp-id text-chalk/50 mb-2">SAMPLE · INPUT</div>
                      <pre className="font-mono text-[12.5px] text-chalk/85 whitespace-pre overflow-x-auto">
                        {activeQ.coding.sample_input}
                      </pre>
                    </div>
                  )}

                  {activeQ.coding.sample_output && (
                    <div className="border border-chalk/15 p-4">
                      <div className="stamp-id text-chalk/50 mb-2">SAMPLE · OUTPUT</div>
                      <pre className="font-mono text-[12.5px] text-chalk/85 whitespace-pre overflow-x-auto">
                        {activeQ.coding.sample_output}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Nav arrows */}
                <div className="flex gap-3 mt-8 border-t border-chalk/10 pt-6">
                  <button
                    onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                    disabled={activeIdx === 0}
                    className="flex-1 h-9 border border-chalk/15 text-chalk/60 hover:text-chalk disabled:opacity-30 text-[12px] font-mono cursor-pointer transition-colors"
                  >
                    ← PREVIOUS
                  </button>
                  <button
                    onClick={() => setActiveIdx(Math.min(questions.length - 1, activeIdx + 1))}
                    disabled={activeIdx === questions.length - 1}
                    className="flex-1 h-9 border border-chalk/15 text-chalk/60 hover:text-chalk disabled:opacity-30 text-[12px] font-mono cursor-pointer transition-colors"
                  >
                    NEXT →
                  </button>
                </div>
              </div>

              {/* Right: Code editor */}
              <div className="flex flex-col min-w-0 overflow-hidden min-h-0">
                <CodeEditor
                  key={activeQ.coding.id}
                  problemId={activeQ.coding.id}
                  sessionId={sessionId}
                  disabled={disabled}
                  onSubmit={(result) => {
                    if (result.verdict === "accepted" && activeQ.coding) {
                      setSolvedCoding((s) => new Set([...s, activeQ.coding!.id]));
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            /* ── MCQ: centred card ── */
            <div className="h-full overflow-y-auto flex items-start justify-center py-16 px-6">
              <div className="max-w-[680px] w-full flex flex-col gap-6">
                <div className="stamp-id text-chalk/50">
                  M{String(activeIdx + 1).padStart(2, "0")} · MULTIPLE CHOICE · {activeQ.mcq?.difficulty?.toUpperCase() || "MEDIUM"}
                </div>

                <div className="border border-chalk/15 p-8 bg-graphite/60">
                  {activeQ.mcq && (
                    <MCQPanel
                      key={activeQ.mcq.id}
                      mcqId={activeQ.mcq.id}
                      question={activeQ.mcq.question}
                      options={activeQ.mcq.options}
                      sessionId={sessionId}
                      disabled={disabled}
                      onAnswer={(mcqId) => {
                        setAnsweredMCQs((s) => new Set([...s, mcqId]));
                      }}
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
                    disabled={activeIdx === 0}
                    className="flex-1 h-10 border border-chalk/15 text-chalk/60 hover:text-chalk disabled:opacity-30 text-[12px] font-mono cursor-pointer transition-colors"
                  >
                    ← PREVIOUS
                  </button>
                  <button
                    onClick={() => setActiveIdx(Math.min(questions.length - 1, activeIdx + 1))}
                    disabled={activeIdx === questions.length - 1}
                    className="flex-1 h-10 border border-chalk/15 text-chalk/60 hover:text-chalk disabled:opacity-30 text-[12px] font-mono cursor-pointer transition-colors"
                  >
                    NEXT →
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="h-full flex items-center justify-center stamp-id text-chalk/40">
            NO QUESTIONS LOADED.
          </div>
        )}
      </div>
    </div>
  );
}
