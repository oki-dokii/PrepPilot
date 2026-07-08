"use client";

import { useMemo } from "react";

export type MasteryNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  mastery: number; // 0..1
};
export type MasteryEdge = { from: string; to: string };

// Canonical topic graph — mastery always starts at 0, set dynamically
export const CANONICAL_NODES: MasteryNode[] = [
  { id: "arr",  label: "Arrays",          x: 80,  y: 200, mastery: 0 },
  { id: "ps",   label: "Prefix Sum",      x: 220, y: 120, mastery: 0 },
  { id: "sw",   label: "Sliding Window",  x: 360, y: 180, mastery: 0 },
  { id: "bs",   label: "Binary Search",   x: 220, y: 300, mastery: 0 },
  { id: "gr",   label: "Greedy",          x: 500, y: 100, mastery: 0 },
  { id: "dp",   label: "Dynamic Prog.",   x: 520, y: 260, mastery: 0 },
  { id: "uf",   label: "Union-Find",      x: 660, y: 180, mastery: 0 },
  { id: "gph",  label: "Graphs",          x: 400, y: 380, mastery: 0 },
  { id: "trie", label: "Trie",            x: 640, y: 360, mastery: 0 },
  { id: "str",  label: "Strings",         x: 80,  y: 360, mastery: 0 },
  { id: "ht",   label: "Hash Tables",     x: 220, y: 420, mastery: 0 },
  { id: "stk",  label: "Stack/Queue",     x: 360, y: 300, mastery: 0 },
];

export const DEFAULT_EDGES: MasteryEdge[] = [
  { from: "arr", to: "ps" },
  { from: "arr", to: "bs" },
  { from: "arr", to: "str" },
  { from: "arr", to: "ht" },
  { from: "ps",  to: "sw" },
  { from: "sw",  to: "gr" },
  { from: "bs",  to: "gph" },
  { from: "gr",  to: "dp" },
  { from: "dp",  to: "uf" },
  { from: "gph", to: "trie" },
  { from: "gph", to: "dp" },
  { from: "sw",  to: "dp" },
  { from: "str", to: "ht" },
  { from: "stk", to: "gph" },
  { from: "arr", to: "stk" },
];

// Keep backward-compat alias
export const DEFAULT_NODES = CANONICAL_NODES;

// Maps topic text (from session spec) → canonical node id
const TOPIC_ALIASES: Record<string, string> = {
  // Arrays
  "arrays": "arr", "array": "arr", "two pointers": "arr",
  // Prefix Sum
  "prefix sum": "ps", "prefix": "ps",
  // Sliding Window
  "sliding window": "sw",
  // Binary Search
  "binary search": "bs", "search": "bs",
  // Greedy
  "greedy": "gr",
  // Dynamic Programming
  "dynamic programming": "dp", "dp": "dp", "interval dp": "dp",
  "knapsack": "dp", "memoization": "dp",
  // Union Find
  "union find": "uf", "union-find": "uf", "disjoint set": "uf",
  // Graphs
  "graphs": "gph", "graph": "gph", "bfs": "gph", "dfs": "gph",
  "trees": "gph", "tree": "gph", "traversal": "gph",
  // Trie
  "trie": "trie", "tries": "trie",
  // Strings
  "strings": "str", "string": "str", "anagram": "str",
  "palindrome": "str",
  // Hash Tables
  "hash tables": "ht", "hash table": "ht", "hashing": "ht",
  "hashmap": "ht", "hash map": "ht",
  // Stack/Queue
  "stack": "stk", "queue": "stk", "stacks": "stk", "queues": "stk",
  "monotonic stack": "stk",
};

export function resolveTopicToNodeId(topic: string): string | null {
  const key = topic.toLowerCase().trim();
  if (TOPIC_ALIASES[key]) return TOPIC_ALIASES[key];
  // Partial match
  for (const [alias, nodeId] of Object.entries(TOPIC_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return nodeId;
  }
  return null;
}

type Size = "sm" | "md" | "lg";

export function MasteryGraph({
  nodes = CANONICAL_NODES,
  edges = DEFAULT_EDGES,
  size = "lg",
  animate = false,
  onNodeClick,
  highlight,
  empty = false,
}: {
  nodes?: MasteryNode[];
  edges?: MasteryEdge[];
  size?: Size;
  animate?: boolean;
  onNodeClick?: (n: MasteryNode) => void;
  highlight?: string[];
  empty?: boolean;
}) {
  const dims = size === "lg" ? { w: 740, h: 460, r: 18, label: true }
             : size === "md" ? { w: 480, h: 300, r: 12, label: true }
             : { w: 260, h: 180, r: 6, label: false };
  const scaleX = dims.w / 740;
  const scaleY = dims.h / 460;
  const map = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <svg
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label="Mastery graph"
    >
      <defs>
        <pattern id="mg-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(47,93,138,0.08)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={dims.w} height={dims.h} fill="url(#mg-grid)" />

      {edges.map((e, i) => {
        const a = map[e.from];
        const b = map[e.to];
        if (!a || !b) return null;
        return (
          <line
            key={i}
            x1={a.x * scaleX}
            y1={a.y * scaleY}
            x2={b.x * scaleX}
            y2={b.y * scaleY}
            stroke={empty ? "rgba(18,20,26,0.15)" : "rgba(47,93,138,0.55)"}
            strokeWidth={size === "sm" ? 0.6 : 1}
            className={animate ? "edge-anim" : ""}
            style={animate ? { animationDelay: `${i * 60}ms` } : undefined}
          />
        );
      })}

      {nodes.map((n, i) => {
        const cx = n.x * scaleX;
        const cy = n.y * scaleY;
        const hl = highlight?.includes(n.id);
        const fill = empty
          ? "rgba(18,20,26,0.08)"
          : n.mastery === 0
          ? "rgba(18,20,26,0.12)"
          : `rgba(76, 122, 98, ${0.15 + n.mastery * 0.75})`;
        return (
          <g
            key={n.id}
            className={animate ? "node-anim" : ""}
            style={animate ? { animationDelay: `${300 + i * 70}ms`, transformOrigin: `${cx}px ${cy}px` } : undefined}
            onClick={() => onNodeClick?.(n)}
            cursor={onNodeClick ? "pointer" : undefined}
          >
            <circle cx={cx} cy={cy} r={dims.r + 4} fill="none" stroke={hl ? "#B24A32" : "rgba(18,20,26,0.15)"} strokeWidth={hl ? 1.2 : 0.6} />
            <circle cx={cx} cy={cy} r={dims.r} fill={fill} stroke="rgba(18,20,26,0.5)" strokeWidth="0.75" />
            {dims.label && (
              <>
                <text
                  x={cx}
                  y={cy + dims.r + 14}
                  textAnchor="middle"
                  fontSize={size === "lg" ? 11 : 10}
                  fontFamily="IBM Plex Sans, system-ui"
                  fill="rgba(18,20,26,0.85)"
                >
                  {n.label}
                </text>
                {!empty && size === "lg" && n.mastery > 0 && (
                  <text
                    x={cx}
                    y={cy + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontFamily="IBM Plex Mono, monospace"
                    fill="rgba(18,20,26,0.7)"
                  >
                    {Math.round(n.mastery * 100)}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
