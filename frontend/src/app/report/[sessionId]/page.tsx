"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { reportsApi } from "@/lib/api";
import Link from "next/link";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { MasteryGraph, DEFAULT_NODES } from "@/components/MasteryGraph";
import { Loader2, Brain, ArrowRight } from "lucide-react";

interface QuestionFeedback {
  question_type: "mcq" | "coding";
  title: string;
  is_correct?: boolean;
  verdict?: string;
  explanation?: string;
  approach?: string;
  complexity?: string;
}

interface ReportData {
  id: string;
  session_id: string;
  mcq_score: number;
  coding_score: number;
  total_score: number;
  weak_topics: string[];
  summary?: {
    questions?: QuestionFeedback[];
    overall_feedback?: string;
    study_plan?: string[];
  };
  status: "ready" | "processing";
  generated_at?: string;
}

export default function ReportPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!sessionId) return;
    const fetchReport = () => {
      reportsApi.get(sessionId)
        .then((res) => {
          setReport(res.data);
          if (res.data.status === "processing") {
            setPolling(true);
          } else {
            setPolling(false);
            setLoading(false);
          }
        })
        .catch(() => {
          setPolling(false);
          setLoading(false);
        });
    };
    fetchReport();
    
    // Poll for report completion if status is processing
    const interval = setInterval(() => { 
      if (polling) fetchReport(); 
    }, 3000);
    
    return () => clearInterval(interval);
  }, [sessionId, polling]);

  // Compute graph highlighting for weak areas
  const weakNodeIds = useMemo(() => {
    if (!report || !report.weak_topics) return [];
    return DEFAULT_NODES.filter((n) => 
      report.weak_topics.some((wt) => 
        wt.toLowerCase().includes(n.label.toLowerCase()) || 
        n.label.toLowerCase().includes(wt.toLowerCase())
      )
    ).map((n) => n.id);
  }, [report]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-chalk">
        <span className="spinner" style={{ width: 32, height: 32 }} />
        <p className="stamp-id">LOADING ASSESSMENT RESULTS…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-chalk">
        <p className="font-display font-medium text-ink">Failed to load report. Return to dashboard.</p>
        <Link href="/dashboard" className="btn btn-ghost">DASHBOARD</Link>
      </div>
    );
  }

  if (report.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-chalk text-ink">
        <div className="stamp-card p-8 text-center max-w-[480px]">
          <div className="w-12 h-12 bg-blueprint/10 text-blueprint flex items-center justify-center border border-blueprint/20 mx-auto mb-4 animate-bounce">
            <Brain size={22} />
          </div>
          <h2 className="font-display text-[18px] font-semibold mb-2">Grading in progress</h2>
          <p className="text-[13.5px] text-ink/70 leading-relaxed mb-6">
            The grading engine is checking your test runs, matching them against runtime rules, and running AI code analytics.
          </p>
          <div className="flex items-center justify-center gap-2 stamp-id">
            <Loader2 className="animate-spin text-blueprint" size={13} />
            <span>ANALYZING CODE SUBMISSIONS…</span>
          </div>
        </div>
      </div>
    );
  }

  const date = report.generated_at ? new Date(report.generated_at).toISOString().split("T")[0] : "—";
  const shortId = `SES-${report.session_id.substring(0, 4).toUpperCase()}`;
  const questions = report.summary?.questions || [];

  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2">{shortId} · REPORT · {date}</div>
      
      {/* Hero Overview Row */}
      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-8 mb-10 items-center">
        <div>
          <h1 className="font-display text-[20px] text-ink/75 mb-1 font-medium">Overall Score</h1>
          <div className="font-mono text-[72px] leading-none tabular-nums font-bold text-ink">
            {report.total_score} <span className="text-[28px] font-normal text-ink/40">/ 100</span>
          </div>
          <div className="stamp-id mt-3">
            {questions.length} QUESTIONS · BREAKDOWN BY TOPIC
          </div>
          {report.weak_topics && report.weak_topics.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {report.weak_topics.map((wt) => (
                <span key={wt} className="stamp-id border border-rust/35 text-rust px-2 py-0.5 bg-rust/5">
                  {wt}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Delta Mastery Graph showing movement highlight */}
        <div className="stamp-card p-5">
          <div className="flex items-baseline justify-between mb-2">
            <div className="font-display text-[14px]">Movement map</div>
            <div className="stamp-id">GRAPH · Δ · {shortId}</div>
          </div>
          <div className="border border-line/80 p-2 bg-chalk/30">
            <MasteryGraph size="md" animate highlight={weakNodeIds} />
          </div>
        </div>
      </div>

      {/* AI Analysis and Study Plan */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        {report.summary?.overall_feedback && (
          <StampCard id="AI · EVALUATION" title="AI analysis">
            <p className="text-[13.5px] leading-relaxed text-ink/80">
              {report.summary.overall_feedback}
            </p>
          </StampCard>
        )}

        {report.summary?.study_plan && report.summary.study_plan.length > 0 && (
          <StampCard id="STUDY · ROADMAP" title="Study plan">
            <ul className="font-mono text-[12px] space-y-2 text-ink/85 list-decimal pl-4">
              {report.summary.study_plan.map((item, i) => (
                <li key={i} className="leading-normal">
                  {item}
                </li>
              ))}
            </ul>
          </StampCard>
        )}
      </div>

      {/* Question Cards Breakdown */}
      {questions.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display text-[20px] font-semibold text-ink mb-4">Per-question breakdown</h2>
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <QuestionCard key={idx} q={q} idx={idx} />
            ))}
          </div>
        </div>
      )}

      {/* Suggested next steps */}
      <h2 className="font-display text-[20px] font-semibold text-ink mb-4">Practice these next</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <Link href="/dashboard" className="stamp-card p-4 hover:border-blueprint block transition-colors group">
          <div className="stamp-id mb-1">ACTION · 01</div>
          <div className="font-display text-[15px] font-medium text-ink mb-2 group-hover:text-blueprint transition-colors flex items-center gap-1.5">
            Configure another assessment <ArrowRight size={14} />
          </div>
          <p className="text-[12px] text-ink/60">Generate another custom test incorporating recommended weak area nodes.</p>
        </Link>
        <Link href="/library" className="stamp-card p-4 hover:border-blueprint block transition-colors group">
          <div className="stamp-id mb-1">ACTION · 02</div>
          <div className="font-display text-[15px] font-medium text-ink mb-2 group-hover:text-blueprint transition-colors flex items-center gap-1.5">
            Browse practice catalog <ArrowRight size={14} />
          </div>
          <p className="text-[12px] text-ink/60">Filter and search static topic banks to drill down on individual nodes.</p>
        </Link>
      </div>
    </LayoutWrapper>
  );
}

function QuestionCard({ q, idx }: { q: QuestionFeedback; idx: number }) {
  const [open, setOpen] = useState(false);
  const correct = q.is_correct || q.verdict === "accepted";
  const isCoding = q.question_type === "coding";

  return (
    <div className="stamp-card p-5 bg-chalk/90">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="stamp-id">Q{String(idx + 1).padStart(2, "0")} · {q.question_type.toUpperCase()}</span>
            <span className={`stamp-id border px-2 py-0.5 ${correct ? "text-mastery border-mastery/40 bg-mastery/5" : "text-rust border-rust/40 bg-rust/5"}`}>
              {correct ? "PASS" : q.verdict ? q.verdict.toUpperCase().replace(/_/g, " ") : "FAIL"}
            </span>
          </div>

          <h3 className="font-display text-[17px] font-semibold text-ink mb-2">{q.title}</h3>
          
          {q.explanation && (
            <p className="text-[13.5px] leading-relaxed text-ink/80 max-w-[760px]">{q.explanation}</p>
          )}

          {q.complexity && (
            <div className="mt-3 font-mono text-[11px] text-blueprint font-semibold">
              COMPLEXITY: {q.complexity}
            </div>
          )}
          
          {(q.approach || q.complexity) && (
            <>
              <button
                onClick={() => setOpen((o) => !o)}
                className="mt-4 stamp-id text-blueprint hover:underline cursor-pointer flex items-center gap-1.5"
              >
                {open ? "▼" : "▶"} ALTERNATIVE APPROACH
              </button>
              {open && q.approach && (
                <p className="mt-2.5 text-[13px] text-ink/70 border-l-2 border-blueprint pl-3 leading-relaxed max-w-[760px] whitespace-pre-line font-display">
                  {q.approach}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
