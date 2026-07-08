"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { eventsApi } from "@/lib/api";
import { Clock, Users, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { LayoutWrapper, StampCard } from "@/components/LayoutWrapper";

interface EventInfo {
  title: string;
  scheduled_start: string;
  duration_minutes: int;
  status: string;
  participant_count: number;
  max_participants: number | null;
}

export default function JoinEventPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [timeLeft, setTimeLeft] = useState<{h: number, m: number, s: number} | null>(null);

  useEffect(() => {
    if (!slug) return;
    
    const fetchEvent = async () => {
      try {
        const res = await eventsApi.getPublicInfo(slug);
        setEvent(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Event not found");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
    const interval = setInterval(fetchEvent, 10000); // Live update count/status
    return () => clearInterval(interval);
  }, [slug]);

  // Countdown timer logic
  useEffect(() => {
    if (!event || event.status !== "scheduled") {
      setTimeLeft(null);
      return;
    }

    const start = new Date(event.scheduled_start).getTime();
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = start - now;
      
      if (diff <= 0) {
        setTimeLeft(null);
        // Soft refresh the event status when timer hits zero
        eventsApi.getPublicInfo(slug).then(res => setEvent(res.data)).catch();
      } else {
        setTimeLeft({
          h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          s: Math.floor((diff % (1000 * 60)) / 1000)
        });
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [event, slug]);

  const handleJoin = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    
    setIsJoining(true);
    try {
      const res = await eventsApi.join(slug);
      router.push(`/test/${res.data.session_id}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to join event");
      setIsJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <span className="spinner" style={{ width: 32, height: 32 }} />
        <p className="stamp-id">LOADING EVENT…</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <p className="font-display font-medium text-foreground">{error || "Event not found."}</p>
        <button onClick={() => router.push("/dashboard")} className="btn btn-ghost">BACK TO DASHBOARD</button>
      </div>
    );
  }

  const isFull = event.max_participants !== null && event.participant_count >= event.max_participants;
  const isStarted = event.status === "open";
  const isClosed = event.status === "closed";

  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2 flex items-center gap-2">
        <Clock size={12} /> SCHEDULED MOCK OA
      </div>

      <div className="flex flex-col gap-8 max-w-2xl mx-auto mt-8">
        <div className="text-center">
          <h1 className="font-display text-[32px] md:text-[42px] font-bold text-foreground mb-4">
            {event.title}
          </h1>
          <div className="flex flex-wrap justify-center gap-4 text-sm font-mono text-foreground/60">
            <span className="flex items-center gap-1.5 border border-border px-3 py-1 bg-background/50">
              <Clock size={14} /> {event.duration_minutes} MINS
            </span>
            <span className="flex items-center gap-1.5 border border-border px-3 py-1 bg-background/50">
              <Users size={14} /> {event.participant_count} {event.max_participants ? `/ ${event.max_participants}` : ''} JOINED
            </span>
          </div>
        </div>

        <StampCard id="STATUS" title="Event Readiness">
          <div className="flex flex-col items-center py-6">
            
            {isClosed ? (
              <div className="text-center text-rust">
                <Lock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-bold font-display">Event Closed</h3>
                <p className="text-sm mt-2">This event has already ended or the join window is closed.</p>
              </div>
            ) : isStarted ? (
              <div className="text-center text-mastery">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-xl font-bold font-display">Event is Live!</h3>
                <p className="text-sm mt-2 text-foreground/70">The assessment is in progress. Join now to begin.</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-foreground/60 mb-4 uppercase tracking-wider font-medium">Starting In</p>
                {timeLeft ? (
                  <div className="flex gap-4 justify-center font-mono text-4xl font-bold text-blueprint">
                    <div className="flex flex-col items-center">
                      <span>{String(timeLeft.h).padStart(2, '0')}</span>
                      <span className="text-[10px] text-foreground/40 font-sans mt-1">HRS</span>
                    </div>
                    <span>:</span>
                    <div className="flex flex-col items-center">
                      <span>{String(timeLeft.m).padStart(2, '0')}</span>
                      <span className="text-[10px] text-foreground/40 font-sans mt-1">MIN</span>
                    </div>
                    <span>:</span>
                    <div className="flex flex-col items-center">
                      <span>{String(timeLeft.s).padStart(2, '0')}</span>
                      <span className="text-[10px] text-foreground/40 font-sans mt-1">SEC</span>
                    </div>
                  </div>
                ) : (
                  <span className="spinner" style={{ width: 24, height: 24 }} />
                )}
                <p className="text-sm mt-6 text-foreground/60">
                  Scheduled for: {new Date(event.scheduled_start).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </StampCard>

        {!isClosed && (
          <div className="flex justify-center mt-4">
            {!user ? (
              <button 
                onClick={() => router.push("/login")}
                className="h-12 px-8 bg-foreground text-background font-medium text-[15px] hover:bg-foreground/90 transition-colors flex items-center gap-2 cursor-pointer"
              >
                Login to Join Event <ArrowRight size={16} />
              </button>
            ) : isFull ? (
              <button 
                disabled
                className="h-12 px-8 bg-foreground/10 text-foreground/50 font-medium text-[15px] flex items-center gap-2 cursor-not-allowed"
              >
                Event is Full <Lock size={16} />
              </button>
            ) : isStarted ? (
              <button 
                onClick={handleJoin}
                disabled={isJoining}
                className="h-12 px-8 bg-blueprint text-chalk font-medium text-[15px] hover:bg-blueprint/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isJoining ? "Joining..." : "Join Assessment"} <ArrowRight size={16} />
              </button>
            ) : (
              <button 
                disabled
                className="h-12 px-8 bg-blueprint/50 text-chalk/50 font-medium text-[15px] flex items-center gap-2 cursor-not-allowed"
              >
                Waiting to Start... <Clock size={16} />
              </button>
            )}
          </div>
        )}

      </div>
    </LayoutWrapper>
  );
}
