"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Navbar from "@/components/Navbar";
import ChatSetup from "@/components/ChatSetup";
import { eventsApi } from "@/lib/api";
import { Calendar, Users, Clock, Copy, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ScheduleNewPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [testId, setTestId] = useState<string | null>(null);
  const [testDuration, setTestDuration] = useState<number>(90);
  
  // Form State
  const [title, setTitle] = useState("Mock OA - " + format(new Date(), "MMM d, yyyy"));
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");
  const [joinWindow, setJoinWindow] = useState(15);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleScheduleReady = (id: string, duration: number) => {
    setTestId(id);
    setTestDuration(duration);
    setStep(2);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testId || !startDate || !startTime) return;
    
    setIsSubmitting(true);
    try {
      const scheduledStartStr = new Date(`${startDate}T${startTime}`).toISOString();
      const maxP = typeof maxParticipants === "number" && maxParticipants > 0 ? maxParticipants : undefined;
      
      const res = await eventsApi.create(testId, title, scheduledStartStr, joinWindow, maxP);
      setCreatedSlug(res.data.slug);
      setStep(3);
    } catch (err) {
      console.error(err);
      alert("Failed to schedule event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareUrl = typeof window !== "undefined" && createdSlug 
    ? `${window.location.origin}/join/${createdSlug}` 
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-12 flex flex-col">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Schedule a Mock OA</h1>
          <p className="text-foreground/60 mt-2">Generate an assessment once, then invite candidates to take it simultaneously.</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-4 mb-10">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blueprint' : 'text-foreground/40'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold border-current">1</div>
            <span className="font-medium text-sm">Design Assessment</span>
          </div>
          <div className={`h-px w-12 ${step >= 2 ? 'bg-blueprint' : 'bg-border'}`} />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blueprint' : 'text-foreground/40'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold border-current">2</div>
            <span className="font-medium text-sm">Schedule Time</span>
          </div>
          <div className={`h-px w-12 ${step === 3 ? 'bg-blueprint' : 'bg-border'}`} />
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-blueprint' : 'text-foreground/40'}`}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold border-current">3</div>
            <span className="font-medium text-sm">Share Link</span>
          </div>
        </div>

        {step === 1 && (
          <div className="bg-background border border-border shadow-sm flex-1 rounded-sm overflow-hidden h-[600px] flex flex-col">
            <ChatSetup 
              onTestReady={() => {}} 
              onCancel={() => router.push("/dashboard")}
              onScheduleReady={handleScheduleReady}
            />
          </div>
        )}

        {step === 2 && (
          <div className="bg-background border border-border p-8 rounded-sm shadow-sm">
            <form onSubmit={handleCreate} className="space-y-6 max-w-xl">
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Event Title</label>
                <input 
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-transparent border border-border p-3 text-sm focus:border-blueprint focus:outline-none rounded-sm transition-colors"
                  placeholder="e.g. SDE-1 Hiring Drive Mock"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <input 
                      type="date"
                      required
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      min={new Date().toISOString().split("T")[0]}
                      className="w-full bg-transparent border border-border pl-10 p-3 text-sm focus:border-blueprint focus:outline-none rounded-sm transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Time</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <input 
                      type="time"
                      required
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full bg-transparent border border-border pl-10 p-3 text-sm focus:border-blueprint focus:outline-none rounded-sm transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Join Window (minutes)</label>
                  <input 
                    type="number"
                    min="5"
                    max="60"
                    required
                    value={joinWindow}
                    onChange={e => setJoinWindow(Number(e.target.value))}
                    className="w-full bg-transparent border border-border p-3 text-sm focus:border-blueprint focus:outline-none rounded-sm transition-colors"
                  />
                  <p className="text-xs text-foreground/50 mt-1">Late entries allowed within this window.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Max Participants</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
                    <input 
                      type="number"
                      min="1"
                      value={maxParticipants}
                      onChange={e => setMaxParticipants(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Unlimited"
                      className="w-full bg-transparent border border-border pl-10 p-3 text-sm focus:border-blueprint focus:outline-none rounded-sm transition-colors"
                    />
                  </div>
                  <p className="text-xs text-foreground/50 mt-1">Leave blank for unlimited.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-border flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setStep(1)}
                  className="px-6 py-2.5 text-sm font-medium border border-border hover:bg-foreground/5 transition-colors rounded-sm"
                >
                  Back
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-6 py-2.5 text-sm font-medium bg-blueprint text-chalk hover:bg-blueprint/90 transition-colors rounded-sm flex items-center gap-2"
                >
                  {isSubmitting ? "Scheduling..." : "Schedule Event"}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="bg-background border border-border p-8 rounded-sm shadow-sm text-center max-w-xl mx-auto">
            <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-2">Event Scheduled!</h2>
            <p className="text-foreground/60 mb-8">Share this link with your candidates. They can join once the countdown reaches zero.</p>
            
            <div className="bg-foreground/5 p-4 rounded-sm flex items-center justify-between border border-border mb-8">
              <span className="font-mono text-sm truncate mr-4">{shareUrl}</span>
              <button 
                onClick={handleCopy}
                className="shrink-0 p-2 hover:bg-foreground/10 text-blueprint rounded transition-colors"
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <Link 
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-blueprint hover:underline"
            >
              Return to Dashboard <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
