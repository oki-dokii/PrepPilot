"use client";

import dynamic from "next/dynamic";
import { useState, useRef } from "react";
import {
  CheckCircle2, XCircle, Clock, Loader2, AlertTriangle,
} from "lucide-react";
import { submissionsApi } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface SubmissionResult {
  verdict: string;
  runtime_ms: number | null;
  passed_hidden_count: number;
  total_hidden_count: number;
  error_output?: string | null;
  stdout?: string | null;
  official_solution?: string | null;
  topic_tags?: string[] | null;
}

interface CodeEditorProps {
  problemId: string;
  sessionId: string;
  disabled: boolean;
  initialData?: { code: string; language: string; verdict?: string };
  onChange?: (code: string, language: string) => void;
  onSubmit?: (result: SubmissionResult) => void;
  starterCode?: Record<string, string>;
  problemStyle?: string;
}

const STARTERS: Record<string, string> = {
  python3: `import sys
input = sys.stdin.readline

def solve():
    # Write your solution here
    pass

if __name__ == '__main__':
    solve()
`,
  javascript: `process.stdin.resume();
process.stdin.setEncoding('utf8');

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
    const lines = input.trim().split('\\n');
    // Write your solution here
});
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    // Write your solution here

    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Write your solution here
    }
}
`,
};

const LANG_LABELS: Record<string, string> = {
  python3: "Python",
  javascript: "JS",
  cpp: "C++",
  java: "Java",
};

const LANG_FILE: Record<string, string> = {
  python3: "SOLUTION.PY",
  javascript: "SOLUTION.JS",
  cpp: "SOLUTION.CPP",
  java: "MAIN.JAVA",
};

const VERDICT_META: Record<string, { label: string; color: string }> = {
  accepted:      { label: "Accepted", color: "var(--mastery)" },
  wrong_answer:  { label: "Wrong Answer", color: "var(--rust)" },
  time_limit:    { label: "Time Limit Exceeded", color: "var(--rust)" },
  runtime_error: { label: "Runtime Error", color: "var(--rust)" },
  compile_error: { label: "Compile Error", color: "var(--rust)" },
  pending:       { label: "Pending…", color: "rgba(236,234,228,0.5)" },
};

export function CodeEditor({ problemId, sessionId, disabled, initialData, onChange, onSubmit, starterCode, problemStyle }: CodeEditorProps) {
  const [language, setLanguage] = useState(initialData?.language || "python3");
  
  // Use starterCode if provided and no initial code exists, otherwise fallback to STARTERS
  const defaultCode = (starterCode?.[language]) || STARTERS[language || "python3"];
  const [code, setCode] = useState(initialData?.code || defaultCode);
  const getDefaultCode = (lang: string) => (starterCode?.[lang]) || STARTERS[lang] || "";
  const handleReset = () => {
    const starter = getDefaultCode(language);
    setCode(starter);
    setResult(null);
    setApiError("");
    setShowSolution(false);
    onChange?.(starter, language);
  };
  const isModified = code !== getDefaultCode(language);
  
  const [submitType, setSubmitType] = useState<"run" | "submit" | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(
    initialData?.verdict ? {
      verdict: initialData.verdict,
      runtime_ms: null,
      passed_hidden_count: 0,
      total_hidden_count: 0,
    } : null
  );
  const [apiError, setApiError] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);
  const editorRef = useRef<any>(null);

  // Drag-to-resize console — clean up listeners on unmount to prevent memory leak
  const isDraggingRef = useRef(false);
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const newHeight = window.innerHeight - moveEvent.clientY;
      setConsoleHeight(Math.max(100, Math.min(newHeight, window.innerHeight * 0.8)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    const newCode = starterCode?.[lang] || STARTERS[lang] || "";
    setCode(newCode);
    setResult(null);
    setApiError("");
    onChange?.(newCode, lang);
  };

  const handleSubmit = async (type: "run" | "submit") => {
    if (submitType || disabled) return;
    setApiError("");
    setResult(null);
    setSubmitType(type);
    try {
      const isCustomRun = type === "run" && showCustomInput && customInput.trim() !== "";
      const res = await submissionsApi.submitCode(sessionId, problemId, code, language, type === "run", isCustomRun ? customInput : undefined);
      setResult(res.data);
      setShowSolution(false); // reset solution reveal on new submission
      if (type === "submit") {
        onSubmit?.(res.data);
      }
    } catch (err: any) {
      setApiError(err?.response?.data?.detail || "Submission failed. Please try again.");
    } finally {
      setSubmitType(null);
    }
  };

  const verdict = result ? (VERDICT_META[result.verdict] || { label: result.verdict, color: "rgba(236,234,228,0.7)" }) : null;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground dark">

      {/* ── Toolbar (matches canvas: stamp-id · SOLUTION.PY + RUN / SUBMIT) ── */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        {/* Left: language tabs */}
        <div className="flex items-center gap-1">
          {Object.entries(LANG_LABELS).map(([lang, label]) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={
                "stamp-id px-2 py-0.5 transition-colors cursor-pointer " +
                (language === lang
                  ? "text-foreground border border-foreground/30 bg-foreground/5"
                  : "text-foreground/40 hover:text-foreground/70")
              }
            >
              {label}
            </button>
          ))}
          <span className="stamp-id text-foreground/30 mx-1">·</span>
          <span className="stamp-id text-foreground/50 flex items-center gap-2">
            {LANG_FILE[language]}
            {problemStyle === 'leetcode' && language === 'python3' && (
              <span className="text-blueprint/80 bg-blueprint/10 px-1.5 rounded-sm">CLASS METHOD</span>
            )}
            {problemStyle === 'standard' && (
              <span className="text-rust/80 bg-rust/10 px-1.5 rounded-sm">STDIN / STDOUT</span>
            )}
          </span>
          {/* Reset button */}
          {isModified && (
            <button
              onClick={handleReset}
              title="Reset to starter code"
              className="stamp-id text-foreground/40 hover:text-foreground/80 border border-transparent hover:border-border px-2 py-0.5 ml-1 transition-colors cursor-pointer text-[10px]"
            >
              ↺ RESET
            </button>
          )}
        </div>

        {/* Custom Input Toggle */}
        <div className="flex items-center ml-auto mr-4">
          <button
            onClick={() => setShowCustomInput(!showCustomInput)}
            className={`stamp-id px-2 py-1 text-[11px] transition-colors border ${
              showCustomInput 
                ? "bg-foreground text-background border-foreground" 
                : "text-foreground/50 border-foreground/20 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            CUSTOM INPUT
          </button>
        </div>

        {/* Right: RUN · SUBMIT */}
        <div className="flex items-center gap-3">
          {submitType && (
            <Loader2 size={12} className="animate-spin text-foreground/50" />
          )}
          <button
            onClick={() => handleSubmit("run")}
            disabled={!!submitType || disabled}
            className="h-7 px-4 border border-primary/50 text-primary hover:bg-primary/10 text-[11px] font-mono disabled:opacity-50 transition-colors"
          >
            {submitType === "run" ? "RUNNING…" : "RUN"}
          </button>
          <button
            id="submit-code-btn"
            onClick={() => handleSubmit("submit")}
            disabled={!!submitType || disabled}
            className="h-7 px-4 bg-primary text-primary-foreground text-[11px] font-mono hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {submitType === "submit" ? "SUBMITTING…" : "SUBMIT"}
          </button>
        </div>
      </div>

      {/* ── Monaco editor ── */}
      <div 
        className="flex-1 overflow-hidden min-h-0"
        style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
      >
        <MonacoEditor
          height="100%"
          language={language === "python3" ? "python" : language === "cpp" ? "cpp" : language === "java" ? "java" : "javascript"}
          value={code}
          onChange={(v) => {
            setCode(v || "");
            onChange?.(v || "", language);
          }}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "\"IBM Plex Mono\", \"JetBrains Mono\", monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "line",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            padding: { top: 16, bottom: 12 },
            readOnly: disabled,
            tabSize: 4,
            lineHeight: 1.65,
          }}
        />
      </div>

      {/* Drag Handle */}
      <div
        className="h-2 w-full cursor-row-resize bg-border hover:bg-primary/20 transition-colors flex-shrink-0 flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-8 h-0.5 bg-foreground/20 rounded-full group-hover:bg-primary/60 transition-colors" />
      </div>

      {/* ── Console output (matches canvas bottom panel) ── */}
      <div className="flex-shrink-0 overflow-y-auto flex flex-col bg-background" style={{ height: consoleHeight }}>
        {/* Custom Input Panel */}
        {showCustomInput && (
          <div className="border-b border-border flex-shrink-0 bg-background p-4">
            <div className="stamp-id text-foreground/40 mb-2">CUSTOM INPUT</div>
            <textarea
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              disabled={disabled || !!submitType}
              className="w-full h-24 bg-foreground/5 border border-border text-foreground font-mono text-[13px] p-3 resize-none focus:outline-none focus:border-foreground/30 transition-colors"
              placeholder="Paste your custom test case input here..."
            />
          </div>
        )}

        <div className="px-4 pt-3 pb-1 flex-1 overflow-y-auto">
          <div className="stamp-id text-foreground/40 mb-2">CONSOLE</div>

          {/* Idle */}
          {!submitType && !result && !apiError && (
            <div className="font-mono text-[12px] text-foreground/40">
              <span className="text-foreground/30">$</span> ready — press SUBMIT to judge
            </div>
          )}

          {/* Judging */}
          {submitType && (
            <div className="font-mono text-[12px] text-foreground/60 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 bg-foreground/60 rounded-full animate-pulse" />
              {submitType === "run" ? "running against sample test cases…" : "running against hidden test cases…"}
            </div>
          )}

          {/* API error */}
          {apiError && (
            <div className="flex items-start gap-2 font-mono text-[12px] text-rust">
              <XCircle size={12} className="mt-0.5 shrink-0" />
              {apiError}
            </div>
          )}

          {/* Result */}
          {result && result.verdict === "custom" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-[12px] text-foreground/80">
                <CheckCircle2 size={12} className="text-foreground/50" />
                Custom Run Complete
                {result.runtime_ms != null && (
                  <span className="text-foreground/40">{result.runtime_ms}ms</span>
                )}
              </div>
              
              {result.stdout && (
                <div className="mt-2">
                  <div className="stamp-id text-foreground/30 mb-1">STDOUT</div>
                  <pre className="font-mono text-[11.5px] whitespace-pre-wrap break-words text-foreground/80">
                    {result.stdout}
                  </pre>
                </div>
              )}
              {result.error_output && (
                <div className="mt-2">
                  <div className="stamp-id text-rust/50 mb-1">STDERR</div>
                  <pre className="font-mono text-[11.5px] whitespace-pre-wrap break-words text-rust">
                    {(result.error_output || "").replace(/\\n/g, '\n')}
                  </pre>
                </div>
              )}
            </div>
          )}

          {result && verdict && result.verdict !== "custom" && (
            <div className="space-y-2">
              {/* Verdict line */}
              <div className="flex flex-col gap-1.5 font-mono text-[13px]" style={{ color: verdict.color }}>
                <div className="flex items-center gap-2 font-bold text-[14px]">
                  {result.verdict === "accepted"
                    ? <CheckCircle2 size={14} />
                    : result.verdict === "time_limit"
                    ? <Clock size={14} />
                    : result.verdict === "wrong_answer"
                    ? <XCircle size={14} />
                    : <AlertTriangle size={14} />}
                  {verdict.label}
                </div>
                {result.total_hidden_count > 0 && (() => {
                  const p = result.passed_hidden_count;
                  const t = result.total_hidden_count;
                  const pct = Math.round((p / t) * 100);
                  // Show test number only — category estimation is too inaccurate without real metadata
                  const failLabel = `test #${p + 1}`;
                  return (
                    <div className="mt-1.5 space-y-1.5">
                      {/* Segmented bar */}
                      <div className="flex gap-[2px] h-[5px] rounded-full overflow-hidden">
                        {Array.from({ length: t }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-full"
                            style={{
                              background: i < p
                                ? 'var(--mastery)'
                                : i === p
                                ? 'var(--rust)'
                                : 'rgba(236,234,228,0.12)'
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span style={{ color: 'rgba(236,234,228,0.55)' }}>
                          {p}/{t} passed
                          {p < t && (
                            <span style={{ color: 'var(--rust)', marginLeft: '0.5rem' }}>
                            · Failed on {failLabel}
                            </span>
                          )}
                        </span>
                        {result.runtime_ms != null && (
                          <span style={{ color: 'rgba(236,234,228,0.4)' }}>
                            {(result.runtime_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {result.total_hidden_count === 0 && result.runtime_ms != null && (
                  <div className="text-foreground/70 text-[12px]">
                    Time: {(result.runtime_ms / 1000).toFixed(2)}s
                  </div>
                )}
              </div>

              {/* Error detail */}
              {result.error_output && (
                <pre
                  className="font-mono text-[11.5px] whitespace-pre-wrap break-words p-3 overflow-y-auto"
                  style={{
                    background: "rgba(178,74,50,0.08)",
                    border: "1px solid rgba(178,74,50,0.25)",
                    color: "var(--rust)",
                  }}
                >
                  {(result.error_output || "").replace(/\\n/g, '\n')}
                </pre>
              )}

              {/* ── Solution reveal (Accepted only) ── */}
              {result.verdict === "accepted" && result.official_solution && (
                <div className="mt-3 border border-foreground/10">
                  <button
                    onClick={() => setShowSolution(s => !s)}
                    className="w-full flex items-center justify-between px-3 py-2 text-foreground/60 hover:text-foreground/90 hover:bg-foreground/5 transition-colors cursor-pointer"
                  >
                    <span className="stamp-id text-[10px]">{showSolution ? '▾' : '▸'} REFERENCE SOLUTION</span>
                    <span className="stamp-id text-[9px] text-foreground/40">{result.topic_tags?.join(' · ')}</span>
                  </button>
                  {showSolution && (
                    <div className="border-t border-foreground/10">
                      <pre
                        className="font-mono text-[11px] whitespace-pre-wrap break-words p-3 overflow-x-auto leading-relaxed"
                        style={{ background: "rgba(76,122,98,0.06)", color: "rgba(236,234,228,0.82)" }}
                      >
                        {result.official_solution.replace(/\\n/g, '\n')}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
