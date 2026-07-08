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
}

interface CodeEditorProps {
  problemId: string;
  sessionId: string;
  disabled: boolean;
  initialData?: { code: string; language: string; verdict: string };
  onChange?: (code: string, language: string) => void;
  onSubmit?: (result: SubmissionResult) => void;
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

export function CodeEditor({ problemId, sessionId, disabled, initialData, onChange, onSubmit }: CodeEditorProps) {
  const [language, setLanguage] = useState(initialData?.language || "python3");
  const [code, setCode] = useState(initialData?.code || STARTERS[initialData?.language || "python3"]);
  const [submitType, setSubmitType] = useState<"run" | "submit" | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(
    initialData ? {
      verdict: initialData.verdict,
      runtime_ms: null,
      passed_hidden_count: 0,
      total_hidden_count: 0,
    } : null
  );
  const [apiError, setApiError] = useState("");
  const editorRef = useRef<any>(null);

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    const newCode = STARTERS[lang] || "";
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
      const res = await submissionsApi.submitCode(sessionId, problemId, code, language, type === "run");
      setResult(res.data);
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
    <div className="flex flex-col h-full min-h-0 bg-graphite">

      {/* ── Toolbar (matches canvas: stamp-id · SOLUTION.PY + RUN / SUBMIT) ── */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-chalk/10 flex-shrink-0">
        {/* Left: language tabs */}
        <div className="flex items-center gap-1">
          {Object.entries(LANG_LABELS).map(([lang, label]) => (
            <button
              key={lang}
              onClick={() => handleLanguageChange(lang)}
              className={
                "stamp-id px-2 py-0.5 transition-colors cursor-pointer " +
                (language === lang
                  ? "text-chalk border border-chalk/30 bg-chalk/5"
                  : "text-chalk/40 hover:text-chalk/70")
              }
            >
              {label}
            </button>
          ))}
          <span className="stamp-id text-chalk/30 mx-1">·</span>
          <span className="stamp-id text-chalk/50">{LANG_FILE[language]}</span>
        </div>

        {/* Right: RUN · SUBMIT */}
        <div className="flex items-center gap-3">
          {submitType && (
            <Loader2 size={12} className="animate-spin text-chalk/50" />
          )}
          <button
            onClick={() => handleSubmit("run")}
            disabled={!!submitType || disabled}
            className="h-7 px-4 border border-chalk/20 text-chalk text-[11px] font-mono hover:bg-chalk/5 disabled:opacity-50 transition-colors"
          >
            {submitType === "run" ? "RUNNING…" : "RUN"}
          </button>
          <button
            id="submit-code-btn"
            onClick={() => handleSubmit("submit")}
            disabled={!!submitType || disabled}
            className="h-7 px-4 bg-chalk text-graphite text-[11px] font-mono hover:bg-chalk/90 disabled:opacity-50 transition-colors"
          >
            {submitType === "submit" ? "SUBMITTING…" : "SUBMIT"}
          </button>
        </div>
      </div>

      {/* ── Monaco editor ── */}
      <div className="flex-1 overflow-hidden min-h-0">
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

      {/* ── Console output (matches canvas bottom panel) ── */}
      <div className="border-t border-chalk/10 flex-shrink-0 overflow-y-auto" style={{ maxHeight: 180 }}>
        <div className="px-4 pt-3 pb-1">
          <div className="stamp-id text-chalk/40 mb-2">CONSOLE</div>

          {/* Idle */}
          {!submitType && !result && !apiError && (
            <div className="font-mono text-[12px] text-chalk/40">
              <span className="text-chalk/30">$</span> ready — press SUBMIT to judge
            </div>
          )}

          {/* Judging */}
          {submitType && (
            <div className="font-mono text-[12px] text-chalk/60 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 bg-chalk/60 rounded-full animate-pulse" />
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
          {result && verdict && (
            <div className="space-y-2">
              {/* Verdict line */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-[12px]" style={{ color: verdict.color }}>
                  {result.verdict === "accepted"
                    ? <CheckCircle2 size={12} />
                    : result.verdict === "time_limit"
                    ? <Clock size={12} />
                    : <AlertTriangle size={12} />}
                  {verdict.label}
                  {result.total_hidden_count > 0 && (
                    <span className="text-chalk/50">
                      {result.passed_hidden_count}/{result.total_hidden_count} passed
                    </span>
                  )}
                  {result.runtime_ms != null && (
                    <span className="text-chalk/40">{result.runtime_ms}ms</span>
                  )}
                </div>
              </div>

              {/* Error detail */}
              {result.error_output && (
                <pre
                  className="font-mono text-[11.5px] whitespace-pre-wrap break-words p-3 overflow-y-auto"
                  style={{
                    background: "rgba(178,74,50,0.08)",
                    border: "1px solid rgba(178,74,50,0.25)",
                    color: "var(--rust)",
                    maxHeight: 100,
                  }}
                >
                  {result.error_output}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
