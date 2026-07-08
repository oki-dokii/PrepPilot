"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import questionsData from "@/lib/questions.json";
import { Search, ExternalLink, ChevronLeft, ChevronRight, X } from "lucide-react";

const DIFFS = ["ALL", "EASY", "MEDIUM", "HARD"];
const PERIODS = [
  { label: "ALL TIME", value: "all" },
  { label: "LAST 30 DAYS", value: "30 days" },
  { label: "LAST 3 MONTHS", value: "3 months" },
  { label: "LAST 6 MONTHS", value: "6 months" },
];
const PERIOD_BADGE: Record<string, string> = {
  "30 days": "30D",
  "3 months": "3M",
  "6 months": "6M",
};
const ITEMS_PER_PAGE = 30;

export default function LibraryPage() {
  const [companySearch, setCompanySearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const companyInputRef = useRef<HTMLInputElement>(null);

  const [selectedDifficulty, setSelectedDifficulty] = useState("ALL");
  const [selectedTopic, setSelectedTopic] = useState("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const companies = useMemo(() => {
    return Array.from(new Set(questionsData.map((q: any) => q.company))).sort() as string[];
  }, []);

  const topics = useMemo(() => {
    const all = Array.from(new Set(questionsData.map((q: any) => q.topic))).sort();
    return ["ALL", ...all] as string[];
  }, []);

  // Company autocomplete
  useEffect(() => {
    if (companySearch.trim().length === 0) {
      setCompanySuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const q = companySearch.toLowerCase();
    const matches = companies.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
    setCompanySuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [companySearch, companies]);

  const filteredQuestions = useMemo(() => {
    return questionsData.filter((q: any) => {
      const matchesCompany = !selectedCompany || q.company === selectedCompany;
      const matchesDifficulty = selectedDifficulty === "ALL" || q.difficulty.toUpperCase() === selectedDifficulty;
      const matchesTopic = selectedTopic === "ALL" || q.topic === selectedTopic;
      const matchesPeriod = selectedPeriod === "all" || (q.periods && q.periods.includes(selectedPeriod));

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        q.title.toLowerCase().includes(query) ||
        q.topic.toLowerCase().includes(query) ||
        q.company.toLowerCase().includes(query) ||
        q.id.toString().includes(query);

      return matchesCompany && matchesDifficulty && matchesTopic && matchesPeriod && matchesSearch;
    });
  }, [selectedCompany, selectedDifficulty, selectedTopic, selectedPeriod, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCompany, selectedDifficulty, selectedTopic, selectedPeriod, searchQuery]);

  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredQuestions, currentPage]);

  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2">DOC-05 · PRACTICE LIBRARY</div>
      <h1 className="font-display text-[32px] tracking-tight mb-2 text-foreground font-medium">Practice Library</h1>
      <p className="text-[13.5px] text-foreground/60 mb-8 max-w-[700px]">
        Real interview questions (PYQs) from top tech companies — sourced from LeetCode. Filter by company, period, topic, or difficulty. Click any title to solve it on LeetCode.
      </p>

      {/* Search + Company Row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-[800px]">
        {/* Title search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/45" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, topic or problem ID..."
            className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-sm text-[13.5px] text-foreground placeholder-foreground/40 focus:outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint transition-all"
          />
        </div>

        {/* Company autocomplete */}
        <div className="relative w-full sm:w-[240px]" ref={companyInputRef as any}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/45" size={16} />
          <input
            type="text"
            value={selectedCompany ? selectedCompany : companySearch}
            onChange={(e) => {
              if (selectedCompany) setSelectedCompany(null);
              setCompanySearch(e.target.value);
            }}
            onFocus={() => {
              if (companySuggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Search company..."
            className="w-full h-10 pl-10 pr-8 bg-background border border-border rounded-sm text-[13.5px] text-foreground placeholder-foreground/40 focus:outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint transition-all"
          />
          {(selectedCompany || companySearch) && (
            <button
              onClick={() => {
                setSelectedCompany(null);
                setCompanySearch("");
                setShowSuggestions(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
            >
              <X size={14} />
            </button>
          )}
          {/* Dropdown */}
          {showSuggestions && (
            <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-background border border-border shadow-lg rounded-sm overflow-hidden">
              {companySuggestions.map((c) => (
                <button
                  key={c}
                  onMouseDown={() => {
                    setSelectedCompany(c);
                    setCompanySearch("");
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left px-4 py-2.5 stamp-id hover:bg-blueprint/10 hover:text-blueprint transition-colors border-b border-border/50 last:border-0"
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col gap-5 mb-8 pb-6 border-b border-border">
        {/* Time Period Filter */}
        <div>
          <div className="stamp-id mb-2">TIME PERIOD</div>
          <div className="flex gap-1.5 flex-wrap">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPeriod(p.value)}
                className={
                  "stamp-id border px-2.5 py-1 cursor-pointer transition-colors " +
                  (selectedPeriod === p.value
                    ? "border-blueprint text-blueprint bg-blueprint/10 font-bold"
                    : "border-border hover:border-foreground/30")
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Difficulty Filter */}
          <div>
            <div className="stamp-id mb-2">DIFFICULTY LEVEL</div>
            <div className="flex gap-1.5 flex-wrap">
              {DIFFS.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDifficulty(d)}
                  className={
                    "stamp-id border px-2.5 py-1 cursor-pointer transition-colors " +
                    (selectedDifficulty === d
                      ? "border-blueprint text-blueprint bg-blueprint/10 font-bold"
                      : "border-border hover:border-foreground/30")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Topic Filter */}
          <div>
            <div className="stamp-id mb-2">FILTER BY TOPIC</div>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="h-8 px-2 bg-background border border-border rounded-sm text-[12px] text-foreground font-mono focus:outline-none focus:border-blueprint cursor-pointer"
            >
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Questions Table */}
      <div className="stamp-card bg-background/90 overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-foreground/3">
                <th className="p-4 stamp-id w-20">ID</th>
                <th className="p-4 stamp-id">TITLE</th>
                <th className="p-4 stamp-id w-32">COMPANY</th>
                <th className="p-4 stamp-id w-44">TOPIC</th>
                <th className="p-4 stamp-id w-28">DIFFICULTY</th>
                <th className="p-4 stamp-id w-32">PERIODS</th>
                <th className="p-4 stamp-id w-24 text-right">ACCEPTANCE</th>
              </tr>
            </thead>
            <tbody>
              {paginatedQuestions.length > 0 ? (
                paginatedQuestions.map((q: any) => {
                  const isEasy = q.difficulty.toLowerCase() === "easy";
                  const isHard = q.difficulty.toLowerCase() === "hard";
                  // Only show 30D, 3M, 6M badges — skip "all"
                  const visiblePeriods = (q.periods || []).filter((p: string) => p !== "all");

                  return (
                    <tr
                      key={`${q.company}-${q.id}`}
                      className="border-b border-border/70 hover:bg-foreground/2 transition-colors"
                    >
                      <td className="p-4 font-mono text-[12.5px] text-foreground/50">#{q.id}</td>
                      <td className="p-4">
                        <a
                          href={q.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display text-[14.5px] text-foreground hover:text-blueprint transition-colors font-medium flex items-center gap-1.5 group cursor-pointer"
                        >
                          {q.title}
                          <ExternalLink
                            size={12}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-blueprint shrink-0"
                          />
                        </a>
                      </td>
                      <td className="p-4">
                        <span className="stamp-id border border-border bg-foreground/5 px-2 py-0.5 rounded-sm whitespace-nowrap">
                          {q.company}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-mono text-[11px] text-foreground/75">{q.topic}</span>
                      </td>
                      <td className="p-4">
                        <span
                          className={
                            "stamp-id border px-2 py-0.5 rounded-sm " +
                            (isEasy
                              ? "border-mastery/40 text-mastery bg-mastery/5"
                              : isHard
                              ? "border-rust/40 text-rust bg-rust/5"
                              : "border-blueprint/40 text-blueprint bg-blueprint/5")
                          }
                        >
                          {q.difficulty}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-1 flex-wrap">
                          {visiblePeriods.map((period: string) => (
                            <span
                              key={period}
                              className="font-mono text-[10px] border border-border/60 bg-foreground/4 px-1.5 py-0.5 rounded-sm text-foreground/60 whitespace-nowrap"
                            >
                              {PERIOD_BADGE[period] ?? period}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-[12.5px] text-foreground/70 text-right">
                        {q.acceptance}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center stamp-id text-foreground/40">
                    NO QUESTIONS FOUND MATCHING CURRENT CRITERIA.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-4 border-t border-border flex items-center justify-between bg-foreground/3">
          <span className="stamp-id">
            {filteredQuestions.length > 0
              ? `PAGE ${currentPage} OF ${totalPages} · ${filteredQuestions.length} RESULTS`
              : "NO RESULTS"}
          </span>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 w-8 border border-border bg-background flex items-center justify-center text-foreground hover:bg-foreground/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 w-8 border border-border bg-background flex items-center justify-center text-foreground hover:bg-foreground/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </LayoutWrapper>
  );
}
