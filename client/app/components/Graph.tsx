"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import type { Run } from "../lib/types";
import { improved, paretoMask } from "../lib/run";
import Donut from "./Donut";

type NodeDatum = SimulationNodeDatum & {
  id: string;
  depth: number;
};
type LinkDatum = SimulationLinkDatum<NodeDatum> & {
  source: string | NodeDatum;
  target: string | NodeDatum;
};

const REJECTED_RADIUS = 8;
const IMPROVED_RADIUS = 38;

function radiusFor(score: number | null): number {
  return score === null ? REJECTED_RADIUS : IMPROVED_RADIUS;
}

function depthOf(run: Run, id: string, memo = new Map<string, number>()): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const c = run.candidates[id];
  const d = c.parent === null ? 0 : depthOf(run, c.parent, memo) + 1;
  memo.set(id, d);
  return d;
}

type HoverState =
  | { kind: "node"; id: string; x: number; y: number }
  | { kind: "edge"; childId: string; x: number; y: number }
  | null;

type Props = {
  run: Run;
};

export default function Graph({ run }: Props) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<Simulation<NodeDatum, LinkDatum> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [hover, setHover] = useState<HoverState>(null);
  const [, setTick] = useState(0);

  const { nodes, links, maxDepth } = useMemo(() => {
    const depthMemo = new Map<string, number>();
    const nodes: NodeDatum[] = Object.keys(run.candidates).map((id) => ({
      id,
      depth: depthOf(run, id, depthMemo),
    }));
    const links: LinkDatum[] = Object.entries(run.candidates)
      .filter(([, c]) => c.parent !== null)
      .map(([id, c]) => ({ source: c.parent as string, target: id }));
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    return { nodes, links, maxDepth };
  }, [run]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const w = size.w;
    const h = size.h;
    const topPad = Math.max(80, h * 0.12);
    const bottomPad = Math.max(80, h * 0.12);
    const usable = Math.max(120, h - topPad - bottomPad);
    const depthY = (d: number) =>
      maxDepth === 0 ? h / 2 : topPad + (d / maxDepth) * usable;
    const sim = forceSimulation<NodeDatum, LinkDatum>(nodes)
      .force(
        "link",
        forceLink<NodeDatum, LinkDatum>(links)
          .id((d) => d.id)
          .distance(Math.max(120, Math.min(w, h) * 0.12))
          .strength(0.9),
      )
      .force("charge", forceManyBody().strength(-Math.max(450, w * 0.4)))
      .force("center", forceCenter(w / 2, h / 2))
      .force("y", forceY<NodeDatum>((d) => depthY(d.depth)).strength(0.9))
      .force(
        "collide",
        forceCollide<NodeDatum>((d) => {
          const c = run.candidates[d.id];
          return radiusFor(c.score) + 10;
        }),
      )
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links, run, maxDepth, size.w, size.h]);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select<SVGSVGElement, unknown>(svgRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 3])
      .on("zoom", (event) => setTransform(event.transform));
    svg.call(z);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  const nodeById = useMemo(() => {
    const m = new Map<string, NodeDatum>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const hoveredCandidate = hover?.kind === "node" ? run.candidates[hover.id] : null;
  const hoveredEdge = hover?.kind === "edge" ? run.candidates[hover.childId] : null;

  return (
    <div ref={wrapperRef} className="relative w-full h-full bg-zinc-50 dark:bg-zinc-950">
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block"
      >
        <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* edges */}
          {links.map((l, i) => {
            const s = typeof l.source === "string" ? nodeById.get(l.source) : l.source;
            const t = typeof l.target === "string" ? nodeById.get(l.target) : l.target;
            if (!s || !t || s.x == null || s.y == null || t.x == null || t.y == null) return null;
            const childId = typeof l.target === "string" ? l.target : l.target.id;
            const child = run.candidates[childId];
            const isRejected = !improved(child);
            return (
              <g key={i}>
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={isRejected ? "#a1a1aa" : "#52525b"}
                  strokeOpacity={isRejected ? 0.4 : 0.7}
                  strokeWidth={isRejected ? 1.2 : 1.8}
                  strokeDasharray={isRejected ? "4 4" : undefined}
                />
                <line
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke="transparent"
                  strokeWidth={14}
                  className="cursor-help"
                  onMouseEnter={(e) =>
                    setHover({ kind: "edge", childId, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover({ kind: "edge", childId, x: e.clientX, y: e.clientY })
                  }
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
          {/* nodes */}
          {nodes.map((n) => {
            const c = run.candidates[n.id];
            if (n.x == null || n.y == null) return null;
            const r = radiusFor(c.score);
            const isImproved = improved(c);
            const mask = paretoMask(c);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className="cursor-pointer"
                onClick={() => router.push(`/candidate/${n.id}`)}
                onMouseEnter={(e) =>
                  setHover({ kind: "node", id: n.id, x: e.clientX, y: e.clientY })
                }
                onMouseMove={(e) =>
                  setHover({ kind: "node", id: n.id, x: e.clientX, y: e.clientY })
                }
                onMouseLeave={() => setHover(null)}
              >
                {isImproved && mask ? (
                  <Donut radius={r} mask={mask} />
                ) : (
                  <circle r={r} fill="#a1a1aa" stroke="#52525b" strokeWidth={0.8} />
                )}
                {isImproved && (
                  <text
                    textAnchor="middle"
                    dy="0.34em"
                    fontSize={16}
                    fontWeight={700}
                    className="fill-zinc-900 dark:fill-zinc-100 font-mono"
                    pointerEvents="none"
                  >
                    {n.id}
                  </text>
                )}
                {n.id === "0" && (
                  <text
                    textAnchor="middle"
                    y={-r - 8}
                    fontSize={10}
                    className="fill-zinc-500"
                    pointerEvents="none"
                  >
                    root
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredCandidate && hover?.kind === "node" && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          title={`Candidate ${hover.id}`}
          meta={candidateScoreLabel(hoveredCandidate)}
        >
          <div className="text-xs whitespace-pre-wrap font-mono leading-snug">
            {hoveredCandidate.prompt}
          </div>
        </Tooltip>
      )}

      {hoveredEdge && hover?.kind === "edge" && (
        <Tooltip
          x={hover.x}
          y={hover.y}
          title={`Reflection → candidate ${hover.childId}`}
        >
          <ul className="text-xs space-y-2">
            {(hoveredEdge.minibatch ?? []).map((m, i) => (
              <li key={i}>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  feedback
                </div>
                <div className="font-mono whitespace-pre-wrap leading-snug">{m.feedback}</div>
              </li>
            ))}
          </ul>
        </Tooltip>
      )}

      <Legend />
    </div>
  );
}

function Tooltip({
  x,
  y,
  title,
  meta,
  children,
}: {
  x: number;
  y: number;
  title: string;
  meta?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none fixed z-10 max-w-md rounded-md border border-zinc-300 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
      style={{ left: x + 16, top: y + 16 }}
    >
      <div className="mb-1 flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>{title}</span>
        {meta && <span className="text-zinc-700 dark:text-zinc-300">· {meta}</span>}
      </div>
      {children}
    </div>
  );
}

function candidateScoreLabel(c: {
  score: number | null;
  minibatch: { score: number }[] | null;
}): string | null {
  if (c.score !== null) {
    return `Valset Score ${(c.score * 100).toFixed(1)}%`;
  }
  if (c.minibatch && c.minibatch.length > 0) {
    const mean =
      c.minibatch.reduce((a, b) => a + b.score, 0) / c.minibatch.length;
    return `Minibatch Score ${(mean * 100).toFixed(1)}%`;
  }
  return null;
}

function Legend() {
  return (
    <div className="absolute left-4 top-4 rounded-md border border-zinc-300 bg-white/90 p-3 text-xs shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        gepa-viz
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-zinc-400" /> rejected (not eval&apos;d on valset)
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-green-600" /> example correct on valset
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-red-600" /> example wrong on valset
        </li>
        <li className="text-zinc-500">hover edge: feedback · hover node: prompt · click: detail</li>
      </ul>
    </div>
  );
}
