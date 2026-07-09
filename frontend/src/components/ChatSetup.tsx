"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User as UserIcon, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { COMPANY_PRESETS, CompanyPreset } from "@/lib/companyPresets";

type Message = { role: "user" | "assistant"; content: string };

interface ChatSetupProps {
  onTestReady: (sessionId: string) => void;
  onCancel: () => void;
  onScheduleReady?: (testId: string, duration: number) => void;
  weakTopics?: { label: string; id: string; mastery: number }[];
  initialMessage?: string;
}

export default function ChatSetup({ onTestReady, onCancel, onScheduleReady, weakTopics, initialMessage }: ChatSetupProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI Prep Coordinator. What company and role are you interviewing for? (e.g. Microsoft SDE Intern, or entry-level Frontend)"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingTest, setGeneratingTest] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [proposedBlueprint, setProposedBlueprint] = useState<any>(null);
  const [problemStyle, setProblemStyle] = useState<"standard" | "leetcode">("standard");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, generatingTest, proposedBlueprint]);

  // Auto-send initialMessage on mount after 300ms delay
  useEffect(() => {
    if (initialMessage && initialMessage.trim()) {
      const timer = setTimeout(() => {
        handleSend(initialMessage);
      }, 300);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput ?? input;
    if (!textToSend.trim() || loading || generatingTest) return;

    const userMsg: Message = { role: "user", content: textToSend.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setProposedBlueprint(null); // Reset proposal if user asks for changes

    try {
      const res = await api.post("/api/chat/setup-test", { messages: newMessages });
      
      const { reply, is_ready, test_blueprint } = res.data;

      if (is_ready && test_blueprint) {
        setProposedBlueprint(test_blueprint);
        setMessages([...newMessages, { role: "assistant", content: reply || "I've drafted a test blueprint for you. Please review it below." }]);
        setLoading(false);
      } else if (reply) {
        setMessages([...newMessages, { role: "assistant", content: reply }]);
        setLoading(false);
      } else {
        // Fallback: API returned neither reply nor blueprint — reset loading
        setMessages([...newMessages, { role: "assistant", content: "I didn't get a response. Please try rephrasing your request." }]);
        setLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      setMessages([...newMessages, { role: "assistant", content: "Sorry, I ran into an error connecting to the coordinator. Please try again." }]);
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!proposedBlueprint) return;
    setGeneratingTest(true);
    setGenerateError("");
    try {
      const genRes = await api.post("/api/tests/generate", {
         topic: "Custom Assessment",
         difficulty: proposedBlueprint.difficulty || "medium",
         style: problemStyle,
         blueprint: proposedBlueprint.blueprint,
         duration_minutes: proposedBlueprint.duration_minutes || 90
      });
      
      const testId = genRes.data.id;
      const sessionRes = await api.post(`/api/sessions`, { test_id: testId });
      onTestReady(sessionRes.data.id);
      // generatingTest intentionally stays true — parent will navigate away
    } catch (err) {
      console.error(err);
      setGeneratingTest(false);
      setGenerateError("Failed to generate test. Please try again.");
    }
  };


  const handleScheduleEvent = async () => {
    if (!proposedBlueprint || !onScheduleReady) return;
    setGeneratingTest(true);
    setGenerateError("");
    try {
      const genRes = await api.post("/api/tests/generate", {
         topic: "Scheduled Assessment",
         difficulty: proposedBlueprint.difficulty || "medium",
         style: problemStyle,
         blueprint: proposedBlueprint.blueprint,
         duration_minutes: proposedBlueprint.duration_minutes || 90
      });
      onScheduleReady(genRes.data.id, proposedBlueprint.duration_minutes || 90);
      // generatingTest intentionally stays true — parent will navigate away
    } catch (err) {
      console.error(err);
      setGeneratingTest(false);
      setGenerateError("Failed to generate test for scheduling. Please try again.");
    }
  };

  const handleSmartStart = () => {
    if (!weakTopics || weakTopics.length === 0) return;
    const message = `I want to focus on my weak areas: ${weakTopics.map(t => `${t.label} (${Math.round(t.mastery * 100)}%)`).join(', ')}. Build a test targeting these specifically.`;
    handleSend(message);
  };

  const handlePreset = (preset: CompanyPreset) => {
    const message = `I want to prepare for a ${preset.company} interview. Generate a ${preset.duration_minutes}-minute test with ${preset.mcq_count > 0 ? preset.mcq_count + ' MCQs and ' : ''}${preset.coding_count} coding problem${preset.coding_count > 1 ? 's' : ''} focusing on ${preset.topics.join(', ')} at ${preset.difficulty} difficulty.`;
    handleSend(message);
  };

  return (
    <div className="flex flex-col h-[520px] bg-background border border-border stamp-card p-0 relative select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-background/90 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blueprint/10 text-blueprint flex items-center justify-center border border-blueprint/20">
            <Bot size={16} />
          </div>
          <div>
            <h3 className="font-display text-[14px] font-semibold text-foreground leading-tight">Prep Coordinator</h3>
            <p className="stamp-id text-[9px]">DOC-04 · CONVERSATION STAGE</p>
          </div>
        </div>
        <button onClick={onCancel} className="stamp-id text-rust hover:underline cursor-pointer">
          CANCEL
        </button>
      </div>

      {/* Company Preset Strip */}
      <div className="px-4 py-2.5 border-b border-border bg-background/60 overflow-x-auto flex gap-2 no-scrollbar">
        {COMPANY_PRESETS.map(preset => (
          <button
            key={preset.company}
            onClick={() => handlePreset(preset)}
            disabled={loading || generatingTest}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 border border-border hover:border-blueprint hover:bg-blueprint/5 text-foreground/80 hover:text-blueprint transition-colors cursor-pointer disabled:opacity-40"
          >
            <span className="font-mono text-[10px] font-bold text-blueprint/70 w-5 text-center">{preset.icon}</span>
            <span className="font-display text-[12px] whitespace-nowrap">{preset.company}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 relative bg-grid-fine">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-8 h-8 shrink-0 flex items-center justify-center border ${m.role === "user" ? "bg-graphite text-chalk border-border" : "bg-blueprint/10 text-blueprint border-blueprint/25"}`}>
              {m.role === "user" ? <UserIcon size={13} /> : <Bot size={14} />}
            </div>
            <div className={`max-w-[80%] p-4 border text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-background text-foreground border-border" : "bg-background/90 text-foreground/90 border-border"}`}>
              <p className="whitespace-pre-line">{m.content}</p>
              
              {/* If this is the last message and we have a proposed blueprint, render it! */}
              {i === messages.length - 1 && proposedBlueprint && (
                <div className="mt-4 p-4 border border-border bg-background/60">
                  <div className="flex items-baseline justify-between mb-3 border-b border-border pb-2">
                    <span className="font-display text-[14px] text-foreground font-semibold">TEST BLUEPRINT</span>
                    <div className="flex items-center gap-2">
                      {proposedBlueprint.pattern_source === "verified" ? (
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 border border-blueprint text-blueprint bg-blueprint/10 uppercase" title="Grounded in verified OA patterns">
                          Verified {proposedBlueprint.pattern_company} Pattern
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 border border-border text-foreground/50 bg-foreground/5 uppercase" title="Using a general format (no verified data)">
                          Generic Format
                        </span>
                      )}
                      <span className="font-mono text-[10.5px] text-foreground/60">{proposedBlueprint.duration_minutes} MINS</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-4 font-mono text-[12px] text-foreground/80">
                    {Array.isArray(proposedBlueprint.blueprint) && proposedBlueprint.blueprint.map((item: any, idx: number) => (
                      <li key={idx} className="flex gap-2">
                        <span className="text-blueprint font-bold uppercase w-12">{item.type}</span>
                        <span className="flex-1">{item.topic}</span>
                        <span className="uppercase text-[10px] text-foreground/50 border border-border/50 px-1">{item.difficulty}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="mb-4 pt-3 border-t border-border flex items-center justify-between">
                    <span className="text-[13px] text-foreground/80 font-medium">Problem Style:</span>
                    <div className="flex bg-background/50 border border-border p-0.5">
                      <button
                        onClick={() => setProblemStyle("standard")}
                        className={`px-3 py-1 text-[12px] font-mono transition-colors ${problemStyle === "standard" ? "bg-blueprint text-chalk font-bold" : "text-foreground/60 hover:text-foreground"}`}
                      >
                        STDIN (Codeforces)
                      </button>
                      <button
                        onClick={() => setProblemStyle("leetcode")}
                        className={`px-3 py-1 text-[12px] font-mono transition-colors ${problemStyle === "leetcode" ? "bg-blueprint text-chalk font-bold" : "text-foreground/60 hover:text-foreground"}`}
                      >
                        CLASS (LeetCode)
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <div className="flex gap-2">
                      {onScheduleReady ? (
                        <button 
                          onClick={handleScheduleEvent}
                          className="flex-1 py-2 bg-blueprint hover:bg-blueprint/90 text-chalk text-[13px] font-medium transition cursor-pointer"
                        >
                          Generate & Schedule Event
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={handleConfirm}
                            className="flex-1 py-2 bg-blueprint hover:bg-blueprint/90 text-chalk text-[13px] font-medium transition cursor-pointer"
                          >
                            Start Solo Test
                          </button>

                        </>
                      )}
                    </div>
                    <button 
                      onClick={() => handleSend("I want to make some changes to this blueprint.")}
                      className="w-full py-2 bg-transparent hover:bg-foreground/5 text-foreground border border-border text-[13px] font-medium transition cursor-pointer"
                    >
                      I want to make changes
                    </button>
                    {generateError && (
                      <div className="text-[12px] font-mono text-rust border border-rust/30 bg-rust/5 px-3 py-2 mt-1">
                        ⚠ {generateError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {loading && !generatingTest && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-blueprint/10 text-blueprint flex items-center justify-center border border-blueprint/25">
              <Bot size={14} />
            </div>
            <div className="p-3 border border-border flex items-center gap-1.5 h-10 bg-background/80">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blueprint animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blueprint animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blueprint animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Loading Overlay when generating test */}
      {generatingTest && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <Loader2 className="w-8 h-8 animate-spin text-blueprint mb-4" />
          <h3 className="font-display text-[16px] text-foreground font-semibold mb-2">Generating session...</h3>
          <p className="stamp-id max-w-xs leading-relaxed text-[11px]">
            Please wait while the AI compiles the test problems and sets up execution sandboxes.
          </p>
        </div>
      )}

      {/* Footer: Smart Start + Input Form */}
      <div className="p-4 border-t border-border bg-background/95 z-10">
        {/* Smart Start button — shown only when weakTopics exist */}
        {weakTopics && weakTopics.length > 0 && (
          <button
            onClick={handleSmartStart}
            disabled={loading || generatingTest}
            className="w-full mb-2 flex items-center justify-center gap-2 h-9 border border-blueprint/50 bg-blueprint/5 hover:bg-blueprint/10 text-blueprint text-[12.5px] font-medium transition-colors cursor-pointer disabled:opacity-40"
          >
            <span>⚡ Focus My Weak Areas</span>
            <span className="font-mono text-[10px] text-blueprint/60">
              ({weakTopics.map(t => t.label).join(', ')})
            </span>
          </button>
        )}

        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2 border border-border bg-background p-1.5 focus-within:border-blueprint transition"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading || generatingTest}
            placeholder="Microsoft SWE, 3 Coding questions..."
            className="flex-1 bg-transparent border-none outline-none px-3 text-[14px] text-foreground placeholder-ink/35 font-display"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || loading || generatingTest}
            className="w-8 h-8 bg-blueprint text-chalk flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer hover:bg-blueprint/90 transition-colors"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
