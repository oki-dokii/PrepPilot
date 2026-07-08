"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
  mcq_answers?: Record<string, any>;
  code_submissions?: Record<string, any>;
}

export default function TestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const qParam = searchParams.get("q");

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(qParam ? parseInt(qParam, 10) : 0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answeredMCQs, setAnsweredMCQs] = useState<Set<string>>(new Set());
  const [solvedCoding, setSolvedCoding] = useState<Set<string>>(new Set());
  const [localMcqAnswers, setLocalMcqAnswers] = useState<Record<string, string>>({});
  const [localCode, setLocalCode] = useState<Record<string, {code: string, language: string, verdict?: string}>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [tabWarning, setTabWarning] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Anti-cheat trackers
  const [tabSwitches, setTabSwitches] = useState(0);
  const [pasteBursts, setPasteBursts] = useState(0);
  const pasteTimesRef = useRef<number[]>([]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  // Tab-switch / Window-leave warning
  useEffect(() => {
    const onBlur = () => {
      if (session?.status === "active") {
        setTabWarning(true);
        setTabSwitches(c => c + 1);
        setTimeout(() => setTabWarning(false), 4000);
      }
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [session]);

  // Paste tracker
  useEffect(() => {
    const onPaste = () => {
      if (session?.status === "active") {
        const now = Date.now();
        const recent = pasteTimesRef.current.filter(t => now - t < 5000);
        recent.push(now);
        pasteTimesRef.current = recent;
        // Count as a burst if they pasted more than 2 times in 5 seconds
        if (recent.length > 2) {
          setPasteBursts(c => c + 1);
          // reset to avoid double-counting same burst
          pasteTimesRef.current = [];
        }
      }
    };
    // Use capture: true to intercept the event before Monaco Editor can stop propagation
    window.addEventListener("paste", onPaste, { capture: true });
    return () => window.removeEventListener("paste", onPaste, { capture: true });
  }, [session]);

  useEffect(() => {
    if (!sessionId) return;
    sessionsApi.get(sessionId)
      .then((res) => {
        setSession(res.data);
        if (res.data.status === "submitted") setSubmitted(true);
        if (qParam && !isNaN(Number(qParam)) && Number(qParam) >= 0 && Number(qParam) < res.data.questions.length) {
          setActiveIdx(Number(qParam));
        }
      })
      .catch(() => setError("Session not found or you don't have access."))
      .finally(() => setLoading(false));
  }, [sessionId, qParam]);

  const handleExpire = useCallback(() => {
    if (!submitted) handleFinalSubmit();
  }, [submitted]);

  const handleFinalSubmit = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    setShowSubmitConfirm(false);
    try {
      await sessionsApi.submit(sessionId, {
        tab_switches: tabSwitches,
        paste_bursts: pasteBursts,
      });
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
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="h-9 px-3 border border-chalk/15 hover:bg-chalk/5 hover:border-chalk/30 rounded-sm font-mono text-[11px] flex items-center gap-2 cursor-pointer transition-colors"
        >
          <span>{sidebarOpen ? "◀" : "▶"}</span>
          <span>QUESTIONS</span>
        </button>

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
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Vertical Collapsible Sidebar ── */}
        <div
          className={`bg-graphite transition-all duration-300 flex flex-col flex-shrink-0 border-chalk/10 overflow-hidden ${
            sidebarOpen ? "w-64 border-r" : "w-0 border-r-0"
          }`}
        >
          <div className="h-12 border-b border-chalk/10 flex items-center px-4 justify-between flex-shrink-0">
            <span className="stamp-id text-chalk/60 font-semibold">QUESTION SHEET</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-chalk/40 hover:text-chalk text-[11px] font-mono cursor-pointer"
            >
              [ HIDE ]
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto py-2">
            {questions.map((qq, i) => {
              const isAnswered = qq.question_type === "mcq"
                ? qq.mcq && answeredMCQs.has(qq.mcq.id)
                : qq.coding && solvedCoding.has(qq.coding.id);
              const isActive = i === activeIdx;
              
              let resultIcon = null;
              if (disabled) {
                const isCorrect = qq.question_type === "mcq"
                  ? session.mcq_answers?.[qq.mcq?.id || ""]?.is_correct
                  : session.code_submissions?.[qq.coding?.id || ""]?.verdict === "accepted";
                
                if (isCorrect) {
                  resultIcon = <span className="text-mastery text-[12px] font-bold">✓</span>;
                } else {
                  resultIcon = <span className="text-rust text-[12px] font-bold">✗</span>;
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={
                    "w-full h-12 px-4 flex items-center justify-between font-mono text-[13px] border-l-2 transition-all cursor-pointer " +
                    (isActive
                      ? "bg-chalk/10 border-l-chalk text-chalk"
                      : "border-l-transparent text-chalk/60 hover:text-chalk hover:bg-chalk/5")
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className={isAnswered ? "text-chalk font-semibold" : "text-chalk/40"}>
                      {qq.question_type === "mcq" ? "MCQ" : "COD"}-{String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] opacity-40 uppercase truncate max-w-[80px]">
                      {qq.question_type === "mcq" ? qq.mcq?.difficulty : qq.coding?.difficulty}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {resultIcon}
                    <span
                      className={
                        "inline-block h-2 w-2 rounded-full " +
                        (isAnswered ? "bg-blueprint shadow-sm shadow-blueprint" : "border border-chalk/30")
                      }
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main content pane ── */}
        <div className="flex-1 min-w-0 overflow-hidden relative">
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
                  initialData={localCode[activeQ.coding.id] || session.code_submissions?.[activeQ.coding.id]}
                  onChange={(code, language) => {
                    setLocalCode(prev => ({
                      ...prev,
                      [activeQ.coding!.id]: { ...(prev[activeQ.coding!.id] || {}), code, language }
                    }));
                  }}
                  onSubmit={(result) => {
                    if (result.verdict === "accepted" && activeQ.coding) {
                      setSolvedCoding((s) => new Set([...s, activeQ.coding!.id]));
                    }
                    if (activeQ.coding) {
                      setLocalCode(prev => ({
                        ...prev,
                        [activeQ.coding!.id]: { ...(prev[activeQ.coding!.id] || {}), verdict: result.verdict }
                      }));
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
                      initialData={
                        localMcqAnswers[activeQ.mcq.id]
                          ? { chosen_option: localMcqAnswers[activeQ.mcq.id], is_correct: false, correct_option: "" }
                          : session.mcq_answers?.[activeQ.mcq.id]
                      }
                      onAnswer={(mcqId, chosenOption) => {
                        setAnsweredMCQs((s) => new Set([...s, mcqId]));
                        setLocalMcqAnswers(prev => ({ ...prev, [mcqId]: chosenOption }));
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
    </div>
  );
}
