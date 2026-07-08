"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { sessionsApi, authApi } from "@/lib/api";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { MasteryGraph, CANONICAL_NODES, DEFAULT_EDGES, resolveTopicToNodeId } from "@/components/MasteryGraph";
import ChatSetup from "@/components/ChatSetup";
import { Plus, TrendingUp, BookOpen, Zap } from "lucide-react";

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

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const [showNewTest, setShowNewTest] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [masteryData, setMasteryData] = useState<{topic: string, mastery_score: number}[]>([]);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      sessionsApi.list(),
      authApi.getMastery()
    ])
      .then(([sessionsRes, masteryRes]) => {
        setSessions(sessionsRes.data);
        setMasteryData(masteryRes.data);
      })
      .catch((err) => console.error("Failed to load dashboard data:", err))
      .finally(() => setLoadingSessions(false));
  }, [user]);

  // ─── Dynamic mastery computation from backend history ─────────────────
  const masteryNodes = useMemo(() => {
    // Start every node at 0
    const nodes = CANONICAL_NODES.map((n) => ({ ...n, mastery: 0 }));
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

    masteryData.forEach((m) => {
      if (nodeMap[m.topic]) {
        nodeMap[m.topic].mastery = m.mastery_score;
      }
    });

    return nodes;
  }, [masteryData]);

  // Nodes that have been tested and are weakest
  const testedNodes = useMemo(() =>
    masteryNodes.filter((n) => n.mastery > 0),
  [masteryNodes]);

  const untestedNodes = useMemo(() =>
    masteryNodes.filter((n) => n.mastery === 0),
  [masteryNodes]);

  // Next test suggestion: weakest tested topics first, then untested
  const suggestedTopics = useMemo(() => {
    const sorted = [...testedNodes].sort((a, b) => a.mastery - b.mastery);
    if (sorted.length > 0) return sorted.slice(0, 3);
    // No tests yet — suggest a starter path
    return masteryNodes.filter((n) => ["arr", "str", "bs"].includes(n.id));
  }, [testedNodes, masteryNodes]);

  const submittedCount = sessions.filter(s => s.status === "submitted").length;
  const avgScore = useMemo(() => {
    const scored = sessions.filter(s => s.score !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((a, s) => a + s.score!, 0) / scored.length);
  }, [sessions]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
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
            <h1 className="font-display text-[32px] tracking-tight text-foreground font-medium">Dashboard</h1>
          </div>
          <button
            id="new-test-btn"
            className="btn btn-primary"
            onClick={() => setShowNewTest(true)}
          >
            <Plus size={14} /> New Test
          </button>
        </div>

        {/* Quick stats bar */}
        {!loadingSessions && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="stamp-card p-4 flex items-center gap-3">
              <BookOpen size={18} className="text-blueprint shrink-0" />
              <div>
                <div className="stamp-id mb-0.5">TESTS TAKEN</div>
                <div className="font-display text-[22px] font-semibold text-foreground">{submittedCount}</div>
              </div>
            </div>
            <div className="stamp-card p-4 flex items-center gap-3">
              <TrendingUp size={18} className="text-mastery shrink-0" />
              <div>
                <div className="stamp-id mb-0.5">AVG SCORE</div>
                <div className="font-display text-[22px] font-semibold text-foreground">
                  {avgScore !== null ? `${avgScore}%` : "—"}
                </div>
              </div>
            </div>
            <div className="stamp-card p-4 flex items-center gap-3">
              <Zap size={18} className="text-rust shrink-0" />
              <div>
                <div className="stamp-id mb-0.5">TOPICS PRACTICED</div>
                <div className="font-display text-[22px] font-semibold text-foreground">{testedNodes.length} / {masteryNodes.length}</div>
              </div>
            </div>
          </div>
        )}

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
            <div className="border border-border bg-background/40 p-4">
              <MasteryGraph
                nodes={masteryNodes}
                animate
                onNodeClick={(n) => setFocusTopic(n.id)}
                highlight={focusTopic ? [focusTopic] : []}
                empty={testedNodes.length === 0}
              />
            </div>
            <div className="mt-4 flex items-center justify-between stamp-id">
              <span>
                {testedNodes.length === 0
                  ? "COMPLETE A TEST TO SEE YOUR MASTERY MAP"
                  : `${testedNodes.length} TOPICS ACTIVE · ${untestedNodes.length} UNTESTED`}
              </span>
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
              {testedNodes.length === 0 ? (
                // No data — give beginner suggestion
                <>
                  <p className="text-[14px] text-foreground/75 leading-relaxed mb-4">
                    You haven&apos;t completed any tests yet. Start with the fundamentals to establish your baseline mastery.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {suggestedTopics.map((n) => (
                      <span key={n.id} className="stamp-id border border-border px-2 py-1 bg-background/20">
                        {n.label} · Start here
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                // Dynamic suggestion from real data
                <>
                  <p className="text-[14px] text-foreground/75 leading-relaxed mb-4">
                    Based on your performance, your weakest areas are{" "}
                    {suggestedTopics.map((n, i) => (
                      <span key={n.id}>
                        <span className="font-mono text-foreground font-semibold">{n.label}</span>
                        {i < suggestedTopics.length - 1 ? ", " : ""}
                      </span>
                    ))}
                    . A focused session here will boost your overall readiness.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {suggestedTopics.map((n) => (
                      <span key={n.id} className="stamp-id border border-border px-2 py-1 bg-background/20">
                        {n.label} · {Math.round(n.mastery * 100)}%
                      </span>
                    ))}
                  </div>
                </>
              )}
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
                  <p className="text-[13px] text-foreground/50 font-mono mb-4">NO COMPLETED SESSIONS FOUND</p>
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
                      <li key={s.id} className="px-2 py-3 flex items-center gap-4 hover:bg-foreground/[0.02]">
                        <Link href={s.status === "submitted" ? `/report/${s.id}` : `/test/${s.id}`} className="flex-1 flex items-center gap-4 min-w-0">
                          <div className="stamp-id w-[74px] shrink-0 font-mono text-blueprint font-bold">{shortId}</div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] truncate font-medium text-foreground">
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
                          <div className="font-mono text-[13px] text-foreground shrink-0 font-bold">
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
