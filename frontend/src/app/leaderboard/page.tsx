"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { leaderboardApi } from "@/lib/api";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";
import { Trophy, Clock, Target, Activity } from "lucide-react";

interface GlobalLeaderboardEntry {
  rank: number;
  user_name: string;
  tests_completed: number;
  best_score: number;
  avg_score: number;
  avg_time_seconds: number | null;
  total_score: number;
  is_me: boolean;
}

const formatTime = (seconds: number | null) => {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function LeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [leaderboard, setLeaderboard] = useState<GlobalLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
      return;
    }
    
    if (user) {
      leaderboardApi.getGlobal()
        .then(res => setLeaderboard(res.data))
        .catch(() => setError("Failed to load leaderboard data."))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  // Calculate some aggregate stats for the header
  const totalTests = leaderboard.reduce((sum, e) => sum + e.tests_completed, 0);
  const avgSystemScore = leaderboard.length > 0 
    ? Math.round(leaderboard.reduce((sum, e) => sum + e.avg_score, 0) / leaderboard.length)
    : 0;
  
  const myRank = leaderboard.find(e => e.is_me)?.rank || "—";

  return (
    <LayoutWrapper>
      <div className="mx-auto max-w-[1240px]">
        {error && (
          <div className="mb-4 text-[13px] font-mono text-rust border border-rust/30 bg-rust/5 px-4 py-2.5">
            ⚠ {error}
          </div>
        )}
        
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <div className="stamp-id mb-1">DOC-04 · STANDINGS</div>
            <h1 className="font-display text-[32px] tracking-tight text-foreground font-medium">Global Leaderboard</h1>
            <p className="text-foreground/60 text-[14px] mt-1">Ranking by Best Score, then Average Score, then Average Speed.</p>
          </div>
          
          {/* Quick stats */}
          {!loading && leaderboard.length > 0 && (
            <div className="flex gap-6 border border-border bg-background/50 px-5 py-3">
              <div>
                <div className="text-[10px] text-foreground/50 font-mono mb-0.5">MY RANK</div>
                <div className="text-[18px] font-display font-semibold text-blueprint">#{myRank}</div>
              </div>
              <div className="w-[1px] bg-border my-1" />
              <div>
                <div className="text-[10px] text-foreground/50 font-mono mb-0.5">TOTAL TESTS</div>
                <div className="text-[18px] font-display font-semibold">{totalTests}</div>
              </div>
              <div className="w-[1px] bg-border my-1" />
              <div>
                <div className="text-[10px] text-foreground/50 font-mono mb-0.5">AVG SYS SCORE</div>
                <div className="text-[18px] font-display font-semibold">{avgSystemScore}%</div>
              </div>
            </div>
          )}
        </div>

        <StampCard id="GLOBAL · RANKINGS" title="All-Time Leaderboard">
          {loading ? (
            <div className="py-12 flex justify-center">
              <span className="spinner" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-12 text-center text-foreground/50">
              No tests have been submitted yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-[13px]">
                <thead>
                  <tr className="border-b border-border text-foreground/50 text-left">
                    <th className="py-3 pr-4 font-medium pl-2">RANK</th>
                    <th className="py-3 pr-4 font-medium">CANDIDATE</th>
                    <th className="py-3 pr-4 font-medium text-right">TESTS</th>
                    <th className="py-3 pr-4 font-medium text-right">BEST SCORE</th>
                    <th className="py-3 pr-4 font-medium text-right">AVG SCORE</th>
                    <th className="py-3 pr-4 font-medium text-right">AVG TIME</th>
                    <th className="py-3 font-medium text-right pr-2">CUMULATIVE</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr key={entry.user_name} className={`border-b border-border/40 hover:bg-foreground/[0.02] ${entry.is_me ? "bg-blueprint/5 hover:bg-blueprint/10" : ""}`}>
                      <td className="py-3 pr-4 pl-2 font-bold text-foreground/60">
                        {entry.rank <= 3 ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                            entry.rank === 1 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                            entry.rank === 2 ? "bg-slate-100 text-slate-700 border border-slate-200" :
                            "bg-orange-50 text-orange-800 border border-orange-200"
                          }`}>
                            {entry.rank}
                          </span>
                        ) : (
                          <span className="pl-2">#{entry.rank}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-foreground flex items-center gap-2">
                        {entry.user_name}
                        {entry.is_me && <span className="text-[10px] text-blueprint border border-blueprint/30 px-1.5 py-0.5">YOU</span>}
                      </td>
                      <td className="py-3 pr-4 text-right">{entry.tests_completed}</td>
                      <td className="py-3 pr-4 text-right font-bold text-mastery">{entry.best_score}%</td>
                      <td className="py-3 pr-4 text-right">{entry.avg_score.toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-right text-foreground/70">{formatTime(entry.avg_time_seconds)}</td>
                      <td className="py-3 text-right pr-2 text-blueprint">{entry.total_score.toLocaleString()} xp</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </StampCard>
      </div>
    </LayoutWrapper>
  );
}
