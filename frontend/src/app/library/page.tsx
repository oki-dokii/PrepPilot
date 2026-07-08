"use client";

import { useState } from "react";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import { DEFAULT_NODES } from "@/components/MasteryGraph";

const COMPANIES = ["ALL", "MSFT", "AMZN", "GOOG", "META", "STRIPE"];
const DIFFS = ["ALL", "EASY", "MEDIUM", "HARD"];

export default function LibraryPage() {
  const [selectedCompany, setSelectedCompany] = useState("ALL");
  const [selectedDifficulty, setSelectedDifficulty] = useState("ALL");

  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2">DOC-05 · TOPIC LIBRARY</div>
      <h1 className="font-display text-[32px] tracking-tight mb-6 text-ink font-medium">Library</h1>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-6 mb-8 pb-6 border-b border-line">
        <div>
          <div className="stamp-id mb-2">COMPANY</div>
          <div className="flex gap-1.5 flex-wrap">
            {COMPANIES.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedCompany(c)}
                className={
                  "stamp-id border px-2 py-1 cursor-pointer transition-colors " +
                  (selectedCompany === c ? "border-blueprint text-blueprint bg-blueprint/10 font-bold" : "border-line hover:border-ink/40")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="stamp-id mb-2">DIFFICULTY</div>
          <div className="flex gap-1.5 flex-wrap">
            {DIFFS.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDifficulty(d)}
                className={
                  "stamp-id border px-2 py-1 cursor-pointer transition-colors " +
                  (selectedDifficulty === d ? "border-blueprint text-blueprint bg-blueprint/10 font-bold" : "border-line hover:border-ink/40")
                }
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Topics grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {DEFAULT_NODES.map((n, i) => (
          <div key={n.id} className="stamp-card p-4 bg-chalk/90">
            <div className="flex items-baseline justify-between mb-2">
              <div className="stamp-id">TOPIC-{String(i + 1).padStart(3, "0")}</div>
              <div className="font-mono text-[11.5px] text-ink/65 font-bold">{Math.round(n.mastery * 100)}%</div>
            </div>
            <div className="font-display text-[17px] font-semibold mb-3 text-ink">{n.label}</div>
            <div className="relative h-1.5 bg-ink/8 mb-4 overflow-hidden border border-line">
              <div className="absolute inset-y-0 left-0 bg-mastery" style={{ width: `${n.mastery * 100}%` }} />
            </div>
            <div className="flex justify-between stamp-id">
              <span>{Math.round(15 + n.mastery * 30)} PROBLEMS</span>
              <span className="text-blueprint hover:underline cursor-pointer font-bold">OPEN →</span>
            </div>
          </div>
        ))}
      </div>
    </LayoutWrapper>
  );
}
