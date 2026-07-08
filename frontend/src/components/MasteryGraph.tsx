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

export const DEFAULT_NODES: MasteryNode[] = [
  { id: "arr",  label: "Arrays",         x: 80,  y: 200, mastery: 0.82 },
  { id: "ps",   label: "Prefix Sum",     x: 220, y: 120, mastery: 0.64 },
  { id: "sw",   label: "Sliding Window", x: 360, y: 180, mastery: 0.48 },
  { id: "bs",   label: "Binary Search",  x: 220, y: 300, mastery: 0.71 },
  { id: "gr",   label: "Greedy",         x: 500, y: 100, mastery: 0.32 },
  { id: "dp",   label: "Interval DP",    x: 520, y: 260, mastery: 0.18 },
  { id: "uf",   label: "Union-Find",     x: 660, y: 180, mastery: 0.12 },
  { id: "gph",  label: "Graphs",         x: 400, y: 380, mastery: 0.55 },
  { id: "trie", label: "Trie",           x: 640, y: 360, mastery: 0.28 },
];

export const DEFAULT_EDGES: MasteryEdge[] = [
  { from: "arr", to: "ps" },
  { from: "arr", to: "bs" },
  { from: "ps", to: "sw" },
  { from: "sw", to: "gr" },
  { from: "bs", to: "gph" },
  { from: "gr", to: "dp" },
  { from: "dp", to: "uf" },
  { from: "gph", to: "trie" },
  { from: "gph", to: "dp" },
  { from: "sw", to: "dp" },
];

type Size = "sm" | "md" | "lg";

export function MasteryGraph({
  nodes = DEFAULT_NODES,
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
        const fill = empty ? "rgba(18,20,26,0.08)" : `rgba(76, 122, 98, ${0.15 + n.mastery * 0.75})`;
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
                {!empty && size === "lg" && (
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
