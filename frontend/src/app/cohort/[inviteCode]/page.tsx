"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cohortsApi } from "@/lib/api";
import Link from "next/link";
import { Users, Copy, ArrowRight, Activity, Trophy } from "lucide-react";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";

interface LeaderboardEntry {
  rank: number;
  user_name: string;
  score: number | null;
  percentile: number;
  status: string;
}

interface CohortInfo {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  expires_at: string | null;
  member_count: number;
}

export default function CohortLeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const inviteCode = params.inviteCode as string;

  const [cohort, setCohort] = useState<CohortInfo | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!inviteCode) return;
    
    const fetchAll = async () => {
      try {
        const infoRes = await cohortsApi.getInfo(inviteCode);
        setCohort(infoRes.data);
        
        const lbRes = await cohortsApi.getLeaderboard(inviteCode);
        setLeaderboard(lbRes.data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 10000); // Live update every 10s
    return () => clearInterval(interval);
  }, [inviteCode]);

  const copyInvite = () => {
    if (!cohort) return;
    navigator.clipboard.writeText(cohort.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <span className="spinner" style={{ width: 32, height: 32 }} />
        <p className="stamp-id">LOADING COHORT LEADERBOARD…</p>
      </div>
    );
  }

  if (!cohort) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="font-display font-medium text-foreground">Cohort not found or expired.</p>
        <Link href="/dashboard" className="btn btn-ghost">BACK TO DASHBOARD</Link>
      </div>
    );
  }

  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2 flex items-center gap-2">
        <Users size={12} /> COHORT LEADERBOARD
      </div>

      {/* Header / Info */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start mb-8">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-foreground mb-1">
            {cohort.name}
          </h1>
          <p className="text-[13px] text-foreground/60 font-mono">
            {cohort.member_count} PARTICIPANTS
          </p>
        </div>

        <div className="flex items-center gap-4 border border-border p-3 bg-background/50 stamp-card">
          <div>
            <div className="stamp-id mb-1 text-foreground/50">INVITE CODE</div>
            <div className="font-mono text-[18px] font-bold tracking-wider text-blueprint">
              {cohort.invite_code}
            </div>
          </div>
          <button 
            onClick={copyInvite}
            className="h-10 px-4 flex items-center gap-2 border border-border hover:border-blueprint text-[12px] font-medium transition cursor-pointer"
          >
            <Copy size={14} /> {copied ? "COPIED!" : "COPY"}
          </button>
        </div>
      </div>

      {/* Leaderboard Table */}
      <StampCard id="LIVE · STANDINGS" title="Percentile Leaderboard">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 px-4 stamp-id text-foreground/50 font-normal w-16">RANK</th>
                <th className="py-3 px-4 stamp-id text-foreground/50 font-normal">CANDIDATE</th>
                <th className="py-3 px-4 stamp-id text-foreground/50 font-normal w-32">STATUS</th>
                <th className="py-3 px-4 stamp-id text-foreground/50 font-normal w-24 text-right">SCORE</th>
                <th className="py-3 px-4 stamp-id text-foreground/50 font-normal w-32 text-right">PERCENTILE</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[13px] text-foreground/40 font-mono">
                    Waiting for participants to join...
                  </td>
                </tr>
              ) : (
                leaderboard.map((entry, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-background/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[13px] text-foreground/60">
                      {entry.score !== null ? `#${entry.rank}` : "—"}
                    </td>
                    <td className="py-3 px-4 font-display text-[14px] font-medium flex items-center gap-2">
                      {entry.user_name}
                      {(entry as any).is_me && <span className="stamp-id bg-blueprint text-chalk px-1.5 py-0.5 rounded-sm">YOU</span>}
                    </td>
                    <td className="py-3 px-4">
                      {entry.status === "submitted" ? (
                        <span className="stamp-id text-mastery flex items-center gap-1"><Trophy size={10} /> SUBMITTED</span>
                      ) : entry.status === "active" ? (
                        <span className="stamp-id text-blueprint flex items-center gap-1"><Activity size={10} className="animate-pulse" /> ACTIVE</span>
                      ) : (
                        <span className="stamp-id text-foreground/40">PENDING</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[14px] text-right">
                      {entry.score !== null ? entry.score : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-[14px] text-right">
                      {entry.score !== null ? (
                        <span className={entry.percentile >= 75 ? "text-mastery font-bold" : entry.percentile >= 50 ? "text-foreground" : "text-rust"}>
                          {entry.percentile}th
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </StampCard>
      
      <div className="mt-6 flex justify-center">
        <button 
          onClick={async () => {
            try {
              const res = await cohortsApi.join(inviteCode);
              router.push(`/test/${res.data.session_id}`);
            } catch (err: any) {
              alert(err.response?.data?.detail || "Failed to join");
            }
          }}
          className="h-10 px-6 bg-blueprint text-chalk font-medium text-[14px] hover:bg-blueprint/90 transition-colors flex items-center gap-2 cursor-pointer"
        >
          Join this Cohort <ArrowRight size={16} />
        </button>
      </div>
    </LayoutWrapper>
  );
}
