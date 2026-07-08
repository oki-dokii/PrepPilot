"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { sessionsApi } from "@/lib/api";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { MasteryGraph, DEFAULT_NODES } from "@/components/MasteryGraph";
import ChatSetup from "@/components/ChatSetup";
import { Plus } from "lucide-react";

interface SessionItem {
  id: string;
  test_id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  topic: string;
  difficulty: string;
  style: string | null;
  score: number | null;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Guard
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const [showNewTest, setShowNewTest] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);

  // Fetch session history
  useEffect(() => {
    if (!user) return;
    sessionsApi.list()
      .then((res) => {
        setSessions(res.data);
      })
      .catch((err) => {
        console.error("Failed to load sessions:", err);
      })
      .finally(() => {
        setLoadingSessions(false);
      });
  }, [user]);

  // Compute dynamic mastery nodes based on session scores
  const masteryNodes = useMemo(() => {
    const nodes = DEFAULT_NODES.map((n) => ({ ...n }));
    if (sessions.length === 0) return nodes;

    // Apply adjustments for completed test sessions
    sessions.forEach((s) => {
      if (s.status === "submitted" && s.score !== null) {
        // Find which node matches the session topic
        const matchedNode = nodes.find(
          (n) => n.label.toLowerCase() === s.topic.toLowerCase() || 
                 s.topic.toLowerCase().includes(n.label.toLowerCase())
        );
        if (matchedNode) {
          // Weighted average towards latest test score
          matchedNode.mastery = Math.max(0.1, Math.min(1.0, matchedNode.mastery * 0.4 + (s.score / 100) * 0.6));
        }
      }
    });
    return nodes;
  }, [sessions]);

  // Weakest topics sorted
  const weakestNodes = useMemo(() => {
    return [...masteryNodes].sort((a, b) => a.mastery - b.mastery).slice(0, 3);
  }, [masteryNodes]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chalk">
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <LayoutWrapper>
      <div className="mx-auto max-w-[1240px]">
        {/* Header section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="stamp-id mb-1">DOC-02 · OVERVIEW</div>
            <h1 className="font-display text-[32px] tracking-tight text-ink font-medium">Dashboard</h1>
          </div>
          <button
            id="new-test-btn"
            className="btn btn-primary"
            onClick={() => setShowNewTest(true)}
          >
            <Plus size={14} /> New Test
          </button>
        </div>

        {/* Modal Overlay for Test Setup */}
        {showNewTest && (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 100,
              background: "rgba(18, 20, 26, 0.6)",
              backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "1rem",
            }}
          >
            <div className="w-full max-w-2xl animate-fadeUp">
              <ChatSetup 
                onTestReady={(sessionId) => router.push(`/test/${sessionId}`)} 
                onCancel={() => setShowNewTest(false)} 
              />
            </div>
          </div>
        )}

        {/* Main Grid Layout */}
        <div className="grid lg:grid-cols-[1.55fr_1fr] gap-8">
          {/* Left Column: Interactive Mastery Graph */}
          <StampCard id="GRAPH · YOU · LIVE" title="Mastery graph">
            <div className="border border-line bg-chalk/40 p-4">
              <MasteryGraph 
                nodes={masteryNodes} 
                animate 
                onNodeClick={(n) => setFocusTopic(n.id)} 
                highlight={focusTopic ? [focusTopic] : []} 
              />
            </div>
            <div className="mt-4 flex items-center justify-between stamp-id">
              <span>NODES {masteryNodes.length} · EDGES 10 · STATUS: ONLINE</span>
              {focusTopic && (
                <button 
                  onClick={() => setFocusTopic(null)} 
                  className="text-blueprint hover:underline cursor-pointer font-bold"
                >
                  CLEAR FILTER
                </button>
              )}
            </div>
          </StampCard>

          {/* Right Column: Suggested Test & Recent History */}
          <div className="flex flex-col gap-6">
            <StampCard id="NEXT · SUGGESTED" title="Next test suggestion">
              <p className="text-[14px] text-ink/75 leading-relaxed mb-4">
                Based on your current weakest topics —{" "}
                {weakestNodes.map((n, i) => (
                  <span key={n.id}>
                    <span className="font-mono text-ink font-semibold">{n.label}</span>
                    {i < weakestNodes.length - 1 ? ", " : ""}
                  </span>
                ))}
                — we recommend generating a custom assessment to boost your confidence.
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {weakestNodes.map((n) => (
                  <span key={n.id} className="stamp-id border border-line px-2 py-1 bg-chalk/20">
                    {n.label} · {Math.round(n.mastery * 100)}%
                  </span>
                ))}
              </div>
              <button
                onClick={() => setShowNewTest(true)}
                className="w-full text-center h-10 leading-10 bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 rounded-sm cursor-pointer transition-colors"
              >
                Configure & Start Test
              </button>
            </StampCard>

            <StampCard id="RECENT · REPORTS" title="Recent test reports">
              {loadingSessions ? (
                <div className="py-8 flex justify-center">
                  <span className="spinner" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[13px] text-ink/50 font-mono mb-4">NO COMPLETED SESSIONS FOUND</p>
                  <button 
                    onClick={() => setShowNewTest(true)} 
                    className="stamp-id text-blueprint hover:underline cursor-pointer"
                  >
                    GENERATE FIRST TEST →
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-line -mx-2">
                  {sessions.slice(0, 5).map((s) => {
                    const date = s.started_at ? new Date(s.started_at).toISOString().split("T")[0] : "—";
                    const shortId = `SES-${s.id.substring(0, 4).toUpperCase()}`;
                    return (
                      <li key={s.id} className="px-2 py-3 flex items-center gap-4 hover:bg-ink/[0.02]">
                        <Link href={s.status === "submitted" ? `/report/${s.id}` : `/test/${s.id}`} className="flex-1 flex items-center gap-4 min-w-0">
                          <div className="stamp-id w-[74px] shrink-0 font-mono text-blueprint font-bold">{shortId}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] truncate font-medium text-ink">
                              {s.topic} {s.style ? `· ${s.style}` : ""}
                            </div>
                            <div className="stamp-id flex gap-2">
                              <span>{date}</span>
                              <span className="opacity-60">|</span>
                              <span className={s.status === "active" ? "text-rust font-semibold" : ""}>
                                {s.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="font-mono text-[13px] text-ink shrink-0 font-bold">
                            {s.score !== null ? `${s.score} / 100` : "—"}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </StampCard>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}
