"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { sessionsApi, authApi, eventsApi } from "@/lib/api";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { MasteryGraph, CANONICAL_NODES, DEFAULT_EDGES, resolveTopicToNodeId } from "@/components/MasteryGraph";
import ChatSetup from "@/components/ChatSetup";
import { Plus, TrendingUp, BookOpen, Zap, Clock, Calendar, Copy, CheckCircle2, Pencil, Trash2, X } from "lucide-react";

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

interface EventItem {
  id: string;
  slug: string;
  title: string;
  scheduled_start: string;
  duration_minutes: number;
  join_window_minutes: number;
  status: string;
  max_participants: number | null;
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
  const [masteryData, setMasteryData] = useState<{topic: string, mastery_score: number, last_seen_at?: string}[]>([]);
  const [focusTopic, setFocusTopic] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joiningCohort, setJoiningCohort] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [rescheduleTarget, setRescheduleTarget] = useState<EventItem | null>(null);
  const [rescheduleTitle, setRescheduleTitle] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const handleJoinCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || joiningCohort) return;
    setJoiningCohort(true);
    try {
      router.push(`/join/${inviteCode.trim()}`);
    } catch {
      setJoiningCohort(false);
    }
    // Reset after short delay to prevent double-submit
    setTimeout(() => setJoiningCohort(false), 3000);
  };

  useEffect(() => {
    if (!user) return;
    Promise.all([
      sessionsApi.list(),
      authApi.getMastery(),
      eventsApi.list(),
    ])
      .then(([sessionsRes, masteryRes, eventsRes]) => {
        setSessions(sessionsRes.data);
        setMasteryData(masteryRes.data);
        setEvents(eventsRes.data);
      })
      .catch(() => setDashboardError("Failed to load your data. Please refresh the page."))
      .finally(() => setLoadingSessions(false));
  }, [user]);

  const handleCopySlug = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const handleOpenReschedule = (ev: EventItem) => {
    setRescheduleTarget(ev);
    setRescheduleTitle(ev.title);
    const d = new Date(ev.scheduled_start);
    setRescheduleDate(d.toISOString().split("T")[0]);
    setRescheduleTime(d.toTimeString().substring(0, 5));
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget) return;
    setRescheduling(true);
    try {
      const newStart = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      await eventsApi.reschedule(rescheduleTarget.slug, {
        title: rescheduleTitle,
        scheduled_start: newStart,
      });
      setEvents(prev => prev.map(ev =>
        ev.slug === rescheduleTarget.slug
          ? { ...ev, title: rescheduleTitle, scheduled_start: newStart, status: "scheduled" }
          : ev
      ));
      setRescheduleTarget(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to reschedule");
    } finally {
      setRescheduling(false);
    }
  };

  const handleCancelEvent = async (slug: string) => {
    if (!confirm("Cancel this event? This cannot be undone.")) return;
    try {
      await eventsApi.cancel(slug);
      setEvents(prev => prev.filter(ev => ev.slug !== slug));
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to cancel event");
    }
  };

  // ─── Dynamic mastery computation from backend history ─────────────────
  const masteryNodes = useMemo(() => {
    // Start every node at 0
    const nodes = CANONICAL_NODES.map((n) => ({ ...n, mastery: 0 }));
    const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

    masteryData.forEach((m) => {
      if (nodeMap[m.topic]) {
        nodeMap[m.topic].mastery = m.mastery_score;
        (nodeMap[m.topic] as any).last_seen_at = m.last_seen_at;
      }
    });

    return nodes;
  }, [masteryData]);

  const weakTopicsForChat = useMemo(() => {
    return masteryData
      .filter(m => m.mastery_score < 0.75 && m.mastery_score > 0)
      .sort((a, b) => a.mastery_score - b.mastery_score)
      .slice(0, 3)
      .map(m => {
        const node = CANONICAL_NODES.find(n => n.id === m.topic);
        return { id: m.topic, label: node?.label || m.topic, mastery: m.mastery_score };
      });
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
    const total = scored.reduce((a, s) => a + (s.score ?? 0), 0);
    return scored.length > 0 ? Math.round(total / scored.length) : null;
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
        {/* Error banner */}
        {dashboardError && (
          <div className="mb-4 text-[13px] font-mono text-rust border border-rust/30 bg-rust/5 px-4 py-2.5 flex items-center justify-between">
            <span>⚠ {dashboardError}</span>
            <button onClick={() => setDashboardError("")} className="underline cursor-pointer">Dismiss</button>
          </div>
        )}
        {/* Header section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="stamp-id mb-1">DOC-02 · OVERVIEW</div>
            <h1 className="font-display text-[32px] tracking-tight text-foreground font-medium">Dashboard</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/schedule/new"
              className="btn border border-border bg-background hover:bg-foreground/5 text-foreground flex items-center gap-1.5"
            >
              <Clock size={14} /> Schedule OA
            </Link>
            <button
              id="new-test-btn"
              className="btn btn-primary"
              onClick={() => setShowNewTest(true)}
            >
              <Plus size={14} /> New Test
            </button>
          </div>
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

                weakTopics={weakTopicsForChat}
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
                    {suggestedTopics.map((n) => {
                      const isDue = (n as any).last_seen_at && (new Date().getTime() - new Date((n as any).last_seen_at).getTime()) > 5 * 24 * 60 * 60 * 1000;
                      return (
                        <span key={n.id} className="stamp-id border border-border px-2 py-1 bg-background/20">
                          {n.label} · {Math.round(n.mastery * 100)}%
                          {isDue && <span className="ml-1 text-rust">· 🔁 Due for review</span>}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowNewTest(true)}
                  className="w-full text-center h-10 leading-10 bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 rounded-sm cursor-pointer transition-colors"
                >
                  Configure & Start Test
                </button>
                {weakTopicsForChat.length > 0 && (
                  <button
                    onClick={() => setShowNewTest(true)}
                    id="focus-weak-areas-btn"
                    className="w-full text-center h-10 leading-10 border border-blueprint text-blueprint text-[13px] font-medium hover:bg-blueprint/10 rounded-sm cursor-pointer transition-colors"
                  >
                    ⚡ Focus Weak Areas ({weakTopicsForChat.map(t => t.label).join(', ')})
                  </button>
                )}
              </div>
            </StampCard>

            <StampCard id="EVENT · JOIN" title="Join Scheduled Event">
              <div className="stamp-id mb-2 text-foreground/60">HAVE AN EVENT SLUG?</div>
              <form onSubmit={handleJoinCohort} className="flex gap-2">
                <input
                  type="text"
                  placeholder="PP-X7K2..."
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  disabled={joiningCohort}
                  className="flex-1 bg-background/50 border border-border px-3 text-[13px] font-mono focus:border-blueprint outline-none"
                />
                <button
                  type="submit"
                  disabled={!inviteCode.trim() || joiningCohort}
                  className="px-4 h-9 bg-background hover:bg-background/80 border border-border text-foreground text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {joiningCohort ? "..." : "Join"}
                </button>
              </form>
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

            {events.filter(ev => ev.status !== "closed").length > 0 && (
              <StampCard id="MY · EVENTS" title="Scheduled Events">
                <ul className="divide-y divide-line -mx-2">
                  {events.filter(ev => ev.status !== "closed").map(ev => (
                    <li key={ev.slug} className="px-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium text-foreground truncate">{ev.title}</div>
                          <div className="stamp-id mt-0.5 flex gap-2 items-center">
                            <Calendar size={10} />
                            <span>{new Date(ev.scheduled_start).toLocaleString()}</span>
                            <span className="opacity-40">·</span>
                            <span className={ev.status === "open" ? "text-mastery font-bold" : "text-foreground/60"}>
                              {ev.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <span className="font-mono text-[11px] text-blueprint border border-blueprint/20 bg-blueprint/5 px-2 py-0.5">
                              {ev.slug}
                            </span>
                            <button
                              onClick={() => handleCopySlug(ev.slug)}
                              className="p-1 hover:text-blueprint transition-colors"
                              title="Copy share link"
                            >
                              {copiedSlug === ev.slug ? <CheckCircle2 size={12} className="text-mastery" /> : <Copy size={12} />}
                            </button>
                          </div>
                        </div>
                        {ev.status === "scheduled" && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleOpenReschedule(ev)}
                              className="p-1.5 border border-border hover:border-blueprint hover:text-blueprint transition-colors"
                              title="Reschedule"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleCancelEvent(ev.slug)}
                              className="p-1.5 border border-border hover:border-rust hover:text-rust transition-colors"
                              title="Cancel event"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </StampCard>
            )}
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border border-border w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <div className="stamp-id mb-0.5">EVENT · RESCHEDULE</div>
                <h2 className="font-display text-[17px] font-semibold">Reschedule Event</h2>
              </div>
              <button onClick={() => setRescheduleTarget(null)} className="p-1 hover:text-foreground/60">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleReschedule} className="p-5 flex flex-col gap-4">
              <div>
                <label className="stamp-id block mb-1.5">TITLE</label>
                <input
                  type="text"
                  value={rescheduleTitle}
                  onChange={e => setRescheduleTitle(e.target.value)}
                  required
                  className="w-full h-10 px-3 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="stamp-id block mb-1.5">NEW DATE</label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={e => setRescheduleDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                    className="w-full h-10 px-3 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
                  />
                </div>
                <div>
                  <label className="stamp-id block mb-1.5">NEW TIME</label>
                  <input
                    type="time"
                    value={rescheduleTime}
                    onChange={e => setRescheduleTime(e.target.value)}
                    required
                    className="w-full h-10 px-3 bg-background border border-border focus:border-blueprint focus:outline-none text-[14px] font-display transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="flex-1 h-10 border border-border text-[13px] font-medium hover:bg-foreground/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduling}
                  className="flex-1 h-10 bg-blueprint text-chalk text-[13px] font-medium hover:bg-blueprint/90 disabled:opacity-60 transition-colors"
                >
                  {rescheduling ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutWrapper>
  );
}
