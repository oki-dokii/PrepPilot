"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { LogoMark } from "@/components/LayoutWrapper";
import { MasteryGraph } from "@/components/MasteryGraph";

const FEATURES = [
  { id: "F-01", h: "Original problems, per topic", b: "Generated on request from your target company and weak areas. Not a static bank you can memorize your way through." },
  { id: "F-02", h: "Hidden tests, validated", b: "Every generated problem ships with hidden tests that were themselves executed against reference solutions before you touched it." },
  { id: "F-03", h: "A mastery graph, not a score", b: "See which topics moved after every session. Weak nodes surface first the next time you sit down." },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-chalk text-ink bg-grid">
      {/* Header */}
      <header className="border-b border-line bg-chalk/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-[1240px] px-6 h-14 flex items-center">
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="font-display text-[15px] font-medium tracking-tight">PrepPilot</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[13px]">
            {user ? (
              <Link href="/dashboard" className="px-3 py-1.5 rounded-sm bg-blueprint text-chalk hover:bg-blueprint/90 font-display font-medium">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="px-3 py-1.5 text-ink/70 hover:text-ink transition-colors">Log in</Link>
                <Link href="/register" className="px-3 py-1.5 rounded-sm bg-blueprint text-chalk hover:bg-blueprint/90 font-display font-medium">
                  Start a test
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1240px] px-6 pt-16 pb-24 grid lg:grid-cols-[1fr_1.05fr] gap-14 items-center">
        <div>
          <div className="stamp-id mb-6">DOC-01 · LANDING / HERO</div>
          <h1 className="font-display text-[52px] leading-[1.02] tracking-[-0.02em] max-w-[560px] text-ink">
            Practice OAs that actually feel like the real thing.
          </h1>
          <p className="mt-6 text-[16px] text-ink/70 max-w-[520px] leading-relaxed">
            Original problems generated per topic. Hidden test cases validated before you see them. A mastery graph that shows you what to fix next — not a leaderboard.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link href={user ? "/dashboard" : "/register"} className="px-4 py-2.5 rounded-sm bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 transition-colors font-display">
              Start a test
            </Link>
            <Link href="/library" className="px-4 py-2.5 rounded-sm border border-line text-[14px] hover:bg-ink/5 transition-colors font-display">
              Browse the library
            </Link>
          </div>
          <div className="mt-10 flex gap-8 stamp-id">
            <div><span className="text-ink text-[13px] font-mono">MSFT · OA</span><div>MICROSOFT</div></div>
            <div><span className="text-ink text-[13px] font-mono">AMZN · SDE1</span><div>AMAZON</div></div>
            <div><span className="text-ink text-[13px] font-mono">GOOG · L3</span><div>GOOGLE</div></div>
          </div>
        </div>

        {/* Demo card */}
        <div className="stamp-card p-6 bg-chalk">
          <div className="flex items-baseline justify-between mb-4">
            <div className="font-display text-[14px] font-medium">Live mock — problem generation</div>
            <div className="stamp-id">DEMO-042 / REV.03</div>
          </div>
          <div className="border border-line p-4 mb-3">
            <div className="stamp-id mb-2">INPUT · TOPIC</div>
            <div className="font-mono text-[13px] text-ink">Microsoft OA · Graphs</div>
          </div>
          <div className="flex items-center gap-2 mb-3 text-[11px] font-mono text-ink/60">
            <span className="inline-block h-1.5 w-1.5 bg-mastery rounded-full animate-pulse" />
            Drafting problem · validating hidden tests
          </div>
          <div className="border border-line p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="stamp-id">PROB-0042</div>
              <div className="stamp-id">MEDIUM · 40 MIN</div>
            </div>
            <div className="font-display text-[16px] mb-2 leading-snug font-medium">Restore Network From Broadcast Log</div>
            <p className="text-[13px] text-ink/70 leading-relaxed">
              You are given <span className="font-mono text-ink">n</span> nodes and a log of directed broadcasts. Reconstruct the smallest connected component set such that every broadcast is causally consistent…
            </p>
            <div className="mt-3 flex gap-2 stamp-id">
              <span className="border border-line px-1.5 py-0.5">GRAPHS</span>
              <span className="border border-line px-1.5 py-0.5">UNION-FIND</span>
              <span className="border border-line px-1.5 py-0.5">TOPO-SORT</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features row */}
      <section className="border-y border-line bg-chalk">
        <div className="mx-auto max-w-[1240px] px-6 py-20 grid md:grid-cols-3 gap-10">
          {FEATURES.map((f) => (
            <div key={f.id}>
              <div className="stamp-id mb-3">{f.id}</div>
              <h3 className="font-display text-[20px] mb-2 leading-tight font-semibold">{f.h}</h3>
              <p className="text-[14px] text-ink/70 leading-relaxed">{f.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mastery graph section */}
      <section className="mx-auto max-w-[1240px] px-6 py-24">
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 items-center">
          <div>
            <div className="stamp-id mb-4">DOC-03 · MASTERY MAP</div>
            <h2 className="font-display text-[36px] leading-[1.05] tracking-tight mb-4 font-semibold">The graph is the product.</h2>
            <p className="text-[15px] text-ink/70 leading-relaxed max-w-[440px]">
              Every session moves nodes. Weak edges surface as the next test's focus. Nothing is a black-box "recommendation" — you can see the reasoning.
            </p>
          </div>
          <div className="stamp-card p-6">
            <div className="flex items-baseline justify-between mb-2">
              <div className="stamp-id">GRAPH · YOU · LIVE</div>
              <div className="stamp-id">NODES 09 · EDGES 10</div>
            </div>
            <div className="border border-line bg-chalk/40 p-2">
              <MasteryGraph size="md" animate />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-6 py-20 text-center">
          <h2 className="font-display text-[32px] tracking-tight mb-6 font-semibold">Start a test.</h2>
          <Link href={user ? "/dashboard" : "/register"} className="inline-block px-6 py-3 rounded-sm bg-blueprint text-chalk text-[14px] font-medium hover:bg-blueprint/90 transition-colors font-display">
            Open dashboard
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-6 h-14 flex items-center justify-between stamp-id">
          <span>PREPPILOT · BLUEPRINT EDITION · 2026</span>
          <span>SHEET 01 / 01</span>
        </div>
      </footer>
    </div>
  );
}
