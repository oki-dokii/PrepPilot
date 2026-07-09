"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { LayoutWrapper } from "@/components/LayoutWrapper";
import questionsData from "@/lib/questions.json";
import { libraryApi, testsApi } from "@/lib/api";
import { Search, ExternalLink, ChevronLeft, ChevronRight, X, LibraryBig, Bot, CheckSquare, Square, Check, Loader2 } from "lucide-react";

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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"pyq" | "bank">("pyq");

  // PYQ State
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

  // Question Bank State
  const [bankItems, setBankItems] = useState<any[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [creatingTest, setCreatingTest] = useState(false);

  // Fetch Question Bank
  useEffect(() => {
    if (activeTab === "bank" && bankItems.length === 0) {
      setBankLoading(true);
      Promise.all([
        libraryApi.getProblems(),
        libraryApi.getMCQs()
      ]).then(([problemsRes, mcqsRes]) => {
        const p = problemsRes.data.map((x: any) => ({ ...x, q_type: "coding" }));
        const m = mcqsRes.data.map((x: any) => ({ ...x, title: x.question, q_type: "mcq" }));
        const combined = [...p, ...m].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setBankItems(combined);
      }).finally(() => {
        setBankLoading(false);
      });
    }
  }, [activeTab]);

  const toggleQuestion = (id: string, type: string) => {
    const key = `${type}:${id}`;
    const newSet = new Set(selectedQuestions);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setSelectedQuestions(newSet);
  };

  const handleCreateTest = async () => {
    if (selectedQuestions.size === 0) return;
    setCreatingTest(true);
    try {
      const qList = Array.from(selectedQuestions).map(key => {
        const [type, id] = key.split(":");
        return { type, id };
      });
      const res = await testsApi.createManual("Custom Manual Test", 90, qList);
      router.push(`/join/${res.data.id}`);
    } catch (e) {
      console.error(e);
      alert("Failed to create test");
    } finally {
      setCreatingTest(false);
    }
  };

  // PYQ Logic
  const companies = useMemo(() => Array.from(new Set(questionsData.map((q: any) => q.company))).sort() as string[], []);
  const topics = useMemo(() => ["ALL", ...Array.from(new Set(questionsData.map((q: any) => q.topic))).sort()] as string[], []);

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
      const matchesSearch = !query || q.title.toLowerCase().includes(query) || q.topic.toLowerCase().includes(query) || q.company.toLowerCase().includes(query) || q.id.toString().includes(query);
      return matchesCompany && matchesDifficulty && matchesTopic && matchesPeriod && matchesSearch;
    });
  }, [selectedCompany, selectedDifficulty, selectedTopic, selectedPeriod, searchQuery]);

  useEffect(() => { setCurrentPage(1); }, [selectedCompany, selectedDifficulty, selectedTopic, selectedPeriod, searchQuery, activeTab]);

  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuestions.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredQuestions, currentPage]);


  return (
    <LayoutWrapper>
      <div className="stamp-id mb-2">DOC-05 · LIBRARY</div>
      <h1 className="font-display text-[32px] tracking-tight mb-2 text-foreground font-medium">Question Library</h1>
      
      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-border">
        <button
          onClick={() => setActiveTab("pyq")}
          className={`pb-3 font-display text-[15px] flex items-center gap-2 border-b-2 transition-colors ${activeTab === "pyq" ? "border-blueprint text-blueprint font-semibold" : "border-transparent text-foreground/50 hover:text-foreground/80"}`}
        >
          <LibraryBig size={16} /> LeetCode PYQs
        </button>
        <button
          onClick={() => setActiveTab("bank")}
          className={`pb-3 font-display text-[15px] flex items-center gap-2 border-b-2 transition-colors ${activeTab === "bank" ? "border-blueprint text-blueprint font-semibold" : "border-transparent text-foreground/50 hover:text-foreground/80"}`}
        >
          <Bot size={16} /> AI Question Bank
        </button>
      </div>

      {activeTab === "pyq" ? (
        <>
          <p className="text-[13.5px] text-foreground/60 mb-8 max-w-[700px]">
            Real interview questions (PYQs) from top tech companies — sourced from LeetCode. Filter by company, period, topic, or difficulty. Click any title to solve it on LeetCode.
          </p>

          {/* Search + Company Row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 max-w-[800px]">
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
            <div className="relative w-full sm:w-[240px]" ref={companyInputRef as any}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/45" size={16} />
              <input
                type="text"
                value={selectedCompany ? selectedCompany : companySearch}
                onChange={(e) => {
                  if (selectedCompany) setSelectedCompany(null);
                  setCompanySearch(e.target.value);
                }}
                onFocus={() => { if (companySuggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Search company..."
                className="w-full h-10 pl-10 pr-8 bg-background border border-border rounded-sm text-[13.5px] text-foreground placeholder-foreground/40 focus:outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint transition-all"
              />
              {(selectedCompany || companySearch) && (
                <button
                  onClick={() => { setSelectedCompany(null); setCompanySearch(""); setShowSuggestions(false); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              )}
              {showSuggestions && (
                <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-background border border-border shadow-lg rounded-sm overflow-hidden">
                  {companySuggestions.map((c) => (
                    <button
                      key={c}
                      onMouseDown={() => { setSelectedCompany(c); setCompanySearch(""); setShowSuggestions(false); }}
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
            <div>
              <div className="stamp-id mb-2">TIME PERIOD</div>
              <div className="flex gap-1.5 flex-wrap">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSelectedPeriod(p.value)}
                    className={"stamp-id border px-2.5 py-1 cursor-pointer transition-colors " + (selectedPeriod === p.value ? "border-blueprint text-blueprint bg-blueprint/10 font-bold" : "border-border hover:border-foreground/30")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="stamp-id mb-2">DIFFICULTY LEVEL</div>
                <div className="flex gap-1.5 flex-wrap">
                  {DIFFS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setSelectedDifficulty(d)}
                      className={"stamp-id border px-2.5 py-1 cursor-pointer transition-colors " + (selectedDifficulty === d ? "border-blueprint text-blueprint bg-blueprint/10 font-bold" : "border-border hover:border-foreground/30")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="stamp-id mb-2">FILTER BY TOPIC</div>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="h-8 px-2 bg-background border border-border rounded-sm text-[12px] text-foreground font-mono focus:outline-none focus:border-blueprint cursor-pointer"
                >
                  {topics.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
          </div>

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
                      const visiblePeriods = (q.periods || []).filter((p: string) => p !== "all");

                      return (
                        <tr key={`${q.company}-${q.id}`} className="border-b border-border/70 hover:bg-foreground/2 transition-colors">
                          <td className="p-4 font-mono text-[12.5px] text-foreground/50">#{q.id}</td>
                          <td className="p-4">
                            <a href={q.url} target="_blank" rel="noopener noreferrer" className="font-display text-[14.5px] text-foreground hover:text-blueprint transition-colors font-medium flex items-center gap-1.5 group cursor-pointer">
                              {q.title}
                              <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-blueprint shrink-0" />
                            </a>
                          </td>
                          <td className="p-4"><span className="stamp-id border border-border bg-foreground/5 px-2 py-0.5 rounded-sm whitespace-nowrap">{q.company}</span></td>
                          <td className="p-4"><span className="font-mono text-[11px] text-foreground/75">{q.topic}</span></td>
                          <td className="p-4">
                            <span className={"stamp-id border px-2 py-0.5 rounded-sm " + (isEasy ? "border-mastery/40 text-mastery bg-mastery/5" : isHard ? "border-rust/40 text-rust bg-rust/5" : "border-blueprint/40 text-blueprint bg-blueprint/5")}>
                              {q.difficulty}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-1 flex-wrap">
                              {visiblePeriods.map((period: string) => (
                                <span key={period} className="font-mono text-[10px] border border-border/60 bg-foreground/4 px-1.5 py-0.5 rounded-sm text-foreground/60 whitespace-nowrap">
                                  {PERIOD_BADGE[period] ?? period}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 font-mono text-[12.5px] text-foreground/70 text-right">{q.acceptance}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={7} className="p-8 text-center stamp-id text-foreground/40">NO QUESTIONS FOUND</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-between bg-foreground/3">
              <span className="stamp-id">
                {filteredQuestions.length > 0 ? `PAGE ${currentPage} OF ${totalPages} · ${filteredQuestions.length} RESULTS` : "NO RESULTS"}
              </span>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 w-8 border border-border bg-background flex items-center justify-center text-foreground hover:bg-foreground/5 disabled:opacity-30 cursor-pointer transition-colors"><ChevronLeft size={16} /></button>
                  <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 w-8 border border-border bg-background flex items-center justify-center text-foreground hover:bg-foreground/5 disabled:opacity-30 cursor-pointer transition-colors"><ChevronRight size={16} /></button>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13.5px] text-foreground/60 mb-8 max-w-[700px]">
            Your personal question bank of AI-generated MCQs and Coding Problems. Select questions to construct a custom manual test.
          </p>

          <div className="stamp-card bg-background/90 overflow-hidden border border-border pb-16">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-foreground/3">
                    <th className="p-4 stamp-id w-10 text-center"><CheckSquare size={14} className="text-foreground/40 inline-block"/></th>
                    <th className="p-4 stamp-id w-24">TYPE</th>
                    <th className="p-4 stamp-id">TITLE / PREVIEW</th>
                    <th className="p-4 stamp-id w-44">TOPICS</th>
                    <th className="p-4 stamp-id w-28">DIFFICULTY</th>
                    <th className="p-4 stamp-id w-32">DATE GENERATED</th>
                  </tr>
                </thead>
                <tbody>
                  {bankLoading ? (
                    <tr><td colSpan={6} className="p-8 text-center stamp-id text-foreground/40"><span className="spinner inline-block"/> LOADING...</td></tr>
                  ) : bankItems.length > 0 ? (
                    bankItems.map((q: any) => {
                      const isEasy = q.difficulty.toLowerCase() === "easy";
                      const isHard = q.difficulty.toLowerCase() === "hard";
                      const isSelected = selectedQuestions.has(`${q.q_type}:${q.id}`);

                      return (
                        <tr key={q.id} 
                            onClick={() => toggleQuestion(q.id, q.q_type)}
                            className={`border-b border-border/70 transition-colors cursor-pointer ${isSelected ? "bg-blueprint/5" : "hover:bg-foreground/2"}`}>
                          <td className="p-4 text-center">
                            {isSelected ? <CheckSquare size={16} className="text-blueprint inline-block" /> : <Square size={16} className="text-foreground/30 inline-block" />}
                          </td>
                          <td className="p-4">
                            <span className="stamp-id border border-border bg-foreground/5 px-2 py-0.5 rounded-sm whitespace-nowrap">
                              {q.q_type === "mcq" ? "MCQ" : "CODING"}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-display text-[14.5px] text-foreground font-medium">
                              {q.title}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-1 flex-wrap">
                              {q.topic_tags.map((t: string) => (
                                <span key={t} className="font-mono text-[10px] text-foreground/75 border border-border/50 px-1 rounded-sm bg-foreground/5">{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={"stamp-id border px-2 py-0.5 rounded-sm " + (isEasy ? "border-mastery/40 text-mastery bg-mastery/5" : isHard ? "border-rust/40 text-rust bg-rust/5" : "border-blueprint/40 text-blueprint bg-blueprint/5")}>
                              {q.difficulty}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-[12.5px] text-foreground/70">
                            {new Date(q.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={6} className="p-8 text-center stamp-id text-foreground/40">NO SAVED QUESTIONS FOUND</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Sticky bottom bar when items are selected */}
            {selectedQuestions.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 flex items-center justify-between animate-in slide-in-from-bottom-5">
                <div className="mx-auto max-w-[1240px] w-full flex items-center justify-between px-6">
                  <div className="flex items-center gap-4">
                    <div className="bg-blueprint/20 text-blueprint w-8 h-8 rounded-full flex items-center justify-center font-bold font-mono text-[13px]">
                      {selectedQuestions.size}
                    </div>
                    <div>
                      <div className="font-display font-semibold text-foreground">Questions Selected</div>
                      <div className="text-[12px] text-foreground/60">Ready to generate a custom test</div>
                    </div>
                  </div>
                  <button 
                    onClick={handleCreateTest}
                    disabled={creatingTest}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    {creatingTest ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    CREATE CUSTOM TEST
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </LayoutWrapper>
  );
}
