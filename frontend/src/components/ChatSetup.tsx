"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User as UserIcon, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string };

interface ChatSetupProps {
  onTestReady: (testId: string) => void;
  onCancel: () => void;
}

export default function ChatSetup({ onTestReady, onCancel }: ChatSetupProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm your AI Prep Coordinator. What company and role are you interviewing for? (e.g. Microsoft SDE Intern, or entry-level Frontend)"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingTest, setGeneratingTest] = useState(false);
  const [proposedBlueprint, setProposedBlueprint] = useState<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, generatingTest, proposedBlueprint]);

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
    try {
      const genRes = await api.post("/api/tests/generate", {
         topic: "Custom Assessment",
         difficulty: proposedBlueprint.difficulty || "medium",
         blueprint: proposedBlueprint.blueprint,
         duration_minutes: proposedBlueprint.duration_minutes || 90
      });
      
      const testId = genRes.data.id;
      const sessionRes = await api.post(`/api/sessions/`, { test_id: testId });
      onTestReady(sessionRes.data.id);
    } catch (err) {
      console.error(err);
      setGeneratingTest(false);
      alert("Failed to generate test. Please try again.");
    }
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
                    <span className="font-mono text-[10.5px] text-foreground/60">{proposedBlueprint.duration_minutes} MINS</span>
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
                  
                  <div className="flex flex-col gap-2 pt-3 border-t border-border">
                    <button 
                      onClick={handleConfirm}
                      className="w-full py-2 bg-blueprint hover:bg-blueprint/90 text-chalk text-[13px] font-medium transition cursor-pointer"
                    >
                      Confirm & Start Test
                    </button>
                    <button 
                      onClick={() => handleSend("I want to make some changes to this blueprint.")}
                      className="w-full py-2 bg-transparent hover:bg-foreground/5 text-foreground border border-border text-[13px] font-medium transition cursor-pointer"
                    >
                      I want to make changes
                    </button>
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

      {/* Input Form */}
      <div className="p-4 border-t border-border bg-background/95 z-10">
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
