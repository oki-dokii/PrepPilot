"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface MCQPanelProps {
  mcqId: string;
  question: string;
  options: Record<string, string>;
  sessionId: string;
  onAnswer: (mcqId: string) => void;
  disabled: boolean;
}

export function MCQPanel({ mcqId, question, options, sessionId, onAnswer, disabled }: MCQPanelProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ is_correct: boolean; correct_option: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const entries = Object.entries(options);

  const handleSelect = async (key: string) => {
    if (selected || disabled || submitting) return;
    setSelected(key);
    setSubmitting(true);
    try {
      const { submissionsApi } = await import("@/lib/api");
      const res = await submissionsApi.submitMcq(sessionId, mcqId, key);
      setResult(res.data);
      onAnswer(mcqId);
    } catch {
      setResult({ is_correct: false, correct_option: "" });
      onAnswer(mcqId);
    } finally {
      setSubmitting(false);
    }
  };

  const optionState = (key: string) => {
    if (!selected) return "idle";
    if (key === selected) return "chosen";
    return "other";
  };

  return (
    <div>
      {/* Question text */}
      <p className="font-display text-[15.5px] leading-[1.7] text-chalk mb-5 font-medium">
        {question}
      </p>

      {/* Options */}
      <div className="flex flex-col gap-2.5">
        {entries.map(([key, text]) => {
          const state = optionState(key);
          const isChosen = key === selected;
          const isCorrect = result?.correct_option === key;
          const isWrong = isChosen && result && !result.is_correct;

          let borderClass = "border-chalk/15";
          let bgClass = "";
          let textClass = "text-chalk/75";
          let keyBg = "bg-chalk/5";
          let keyText = "text-chalk/50";

          if (state === "chosen" && !result) {
            borderClass = "border-chalk/40";
            bgClass = "bg-chalk/5";
            textClass = "text-chalk";
            keyBg = "bg-chalk/15";
            keyText = "text-chalk";
          }
          if (isWrong) {
            borderClass = "border-rust/40";
            bgClass = "bg-rust/5";
            textClass = "text-chalk/80";
            keyBg = "bg-rust/20";
            keyText = "text-rust";
          }
          if (isCorrect && result) {
            borderClass = "border-mastery/50";
            bgClass = "bg-mastery/8";
            textClass = "text-chalk/90";
            keyBg = "bg-mastery/20";
            keyText = "text-mastery";
          }

          return (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              disabled={!!selected || disabled || submitting}
              className={
                "flex items-start gap-3 p-4 border text-left transition-all cursor-pointer w-full " +
                borderClass + " " + bgClass + " " +
                (!selected && !disabled ? "hover:border-chalk/30 hover:bg-chalk/5" : "") +
                (selected ? " cursor-default" : "")
              }
            >
              {/* Key badge */}
              <span className={
                "flex-shrink-0 w-6 h-6 flex items-center justify-center stamp-id border border-chalk/15 " +
                keyBg + " " + keyText
              }>
                {key}
              </span>

              {/* Text */}
              <span className={"flex-1 text-[14px] leading-relaxed " + textClass}>
                {text}
              </span>

              {/* Icon */}
              {isCorrect && result && <CheckCircle2 size={15} className="text-mastery shrink-0 mt-0.5" />}
              {isWrong && <XCircle size={15} className="text-rust shrink-0 mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Result feedback (only shown after answering and if session is disabled/submitted) */}
      {result && disabled && (
        <div
          className={
            "mt-4 flex items-center gap-2 stamp-id p-3 " +
            (result.is_correct
              ? "border border-mastery/30 bg-mastery/8 text-mastery"
              : "border border-rust/30 bg-rust/5 text-rust")
          }
        >
          {result.is_correct
            ? <><CheckCircle2 size={12} /> CORRECT</>
            : <><XCircle size={12} /> INCORRECT — CORRECT ANSWER IS <strong>{result.correct_option}</strong></>
          }
        </div>
      )}
    </div>
  );
}
