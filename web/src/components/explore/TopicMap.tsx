import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RefObject } from 'react';
import type { Difficulty, GraphEdge, GraphNode } from '../../api/types';
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, formatMinutes, plural, RELATION_LABEL } from '../../lib/format';
import { cn } from '../../lib/cn';

const NODE_MIN_W = 216;
const NODE_H = 112;
const GAP_X = 16;
const GAP_Y = 16;
const PAD = 16;
const BAND_LABEL_H = 26;
const BAND_GAP = 32;

type Placement = { node: GraphNode; x: number; y: number; w: number; band: number };
type Band = { difficulty: Difficulty; labelY: number; count: number };

/**
 * Difficulty drives the band and the bands run top-to-bottom, so the first thing to study sits at
 * the top. Each band wraps into as many columns as the container allows, and the same data at the
 * same width always draws the same map — learners compare it across sessions.
 */
function layout(nodes: GraphNode[], width: number) {
  const inner = Math.max(NODE_MIN_W, width - PAD * 2);
  const cols = Math.max(1, Math.floor((inner + GAP_X) / (NODE_MIN_W + GAP_X)));
  const cellW = (inner - (cols - 1) * GAP_X) / cols;

  const placed = new Map<number, Placement>();
  const bands: Band[] = [];
  let y = PAD;
  let band = -1;
  for (const difficulty of DIFFICULTY_ORDER) {
    const members = nodes.filter((node) => node.difficulty === difficulty);
    if (members.length === 0) continue;
    band += 1;
    bands.push({ difficulty, labelY: y, count: members.length });
    y += BAND_LABEL_H;
    members.forEach((node, index) => {
      placed.set(node.id, {
        node,
        band,
        x: PAD + (index % cols) * (cellW + GAP_X),
        y: y + Math.floor(index / cols) * (NODE_H + GAP_Y),
        w: cellW
      });
    });
    const lines = Math.ceil(members.length / cols);
    y += lines * NODE_H + (lines - 1) * GAP_Y + BAND_GAP;
  }
  return { placed, bands, width: inner + PAD * 2, height: Math.max(0, y - BAND_GAP + PAD) };
}

const EDGE_TONE: Record<GraphEdge['kind'], string> = {
  strict: 'var(--accent)',
  recommended: 'var(--info)',
  related: 'var(--border-strong)',
  extension: 'var(--success)'
};

/** An edge leaves the face that points at the other card, so an arrow never crosses its own node. */
function edgePath(source: Placement, target: Placement, canvasWidth: number): { line: string; head: string } {
  const sx = source.x + source.w / 2;
  const tx = target.x + target.w / 2;
  if (source.band === target.band) {
    // Stacked in one column — the narrow layout, or a band with a single column — a side-to-side
    // curve would run backwards, so same-band links bow out to the right and enter from that side.
    if (Math.abs(sx - tx) < source.w / 2) {
      const down = target.y > source.y;
      const x = Math.max(source.x, target.x) + source.w;
      const y1 = source.y + (down ? NODE_H * 0.78 : NODE_H * 0.22);
      const y2 = target.y + (down ? NODE_H * 0.22 : NODE_H * 0.78);
      const bulge = Math.min(x + 20, canvasWidth - 2);
      return {
        line: `M ${x} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x} ${y2}`,
        head: `M ${x + 6} ${y2 - 5} L ${x} ${y2} L ${x + 6} ${y2 + 5}`
      };
    }
    const rightward = sx <= tx;
    const x1 = rightward ? source.x + source.w : source.x;
    const x2 = rightward ? target.x : target.x + target.w;
    const y = source.y + NODE_H / 2;
    const lift = y - 20;
    return {
      line: `M ${x1} ${y} C ${(x1 + x2) / 2} ${lift}, ${(x1 + x2) / 2} ${lift}, ${x2} ${y}`,
      head: rightward
        ? `M ${x2 - 6} ${y - 5} L ${x2} ${y} L ${x2 - 6} ${y + 5}`
        : `M ${x2 + 6} ${y - 5} L ${x2} ${y} L ${x2 + 6} ${y + 5}`
    };
  }
  const down = target.y > source.y;
  const y1 = down ? source.y + NODE_H : source.y;
  const y2 = down ? target.y : target.y + NODE_H;
  const bend = Math.max(24, Math.abs(y2 - y1) / 2);
  return {
    line: `M ${sx} ${y1} C ${sx} ${y1 + (down ? bend : -bend)}, ${tx} ${y2 - (down ? bend : -bend)}, ${tx} ${y2}`,
    head: down
      ? `M ${tx - 5} ${y2 - 7} L ${tx} ${y2} L ${tx + 5} ${y2 - 7}`
      : `M ${tx - 5} ${y2 + 7} L ${tx} ${y2} L ${tx + 5} ${y2 + 7}`
  };
}

export function TopicMap({
  nodes,
  edges,
  centerSlug
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerSlug?: string | null;
}) {
  const [active, setActive] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(host);
  const { placed, bands, width: canvasWidth, height } = useMemo(() => layout(nodes, width), [nodes, width]);
  const linkCounts = useMemo(() => countsByNode(nodes, edges), [nodes, edges]);

  const neighbours = useMemo(() => {
    if (!active) return new Set<string>();
    const set = new Set<string>([active]);
    for (const edge of edges) {
      const source = placed.get(edge.source);
      const target = placed.get(edge.target);
      if (!source || !target) continue;
      if (source.node.slug === active) set.add(target.node.slug);
      if (target.node.slug === active) set.add(source.node.slug);
    }
    return set;
  }, [active, edges, placed]);

  const activeNode = active ? nodes.find((node) => node.slug === active) : undefined;

  if (nodes.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-line-strong bg-sunken px-4 py-8 text-center text-caption text-ink-muted">
        This scope has no published topics to draw yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-muted">
        {(Object.keys(EDGE_TONE) as GraphEdge['kind'][]).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-pill" style={{ background: EDGE_TONE[kind] }} aria-hidden />
            {RELATION_LABEL[kind]}
          </span>
        ))}
        <span>Study from the top band down; an arrow points at the topic that needs what precedes it.</span>
      </div>

      <div ref={host} className="overflow-auto rounded-card border border-line bg-raised">
        <div className="relative" style={{ width: canvasWidth, height: height || undefined }}>
          {width > 0 && (
            <>
              {bands.map((band) => (
                <p
                  key={band.difficulty}
                  className="absolute left-4 font-sans text-caption font-semibold uppercase tracking-[0.08em] text-ink-muted"
                  style={{ top: band.labelY }}
                >
                  {DIFFICULTY_LABEL[band.difficulty]}
                  <span className="ml-1.5 font-normal normal-case tracking-normal">
                    {band.count} {plural(band.count, 'topic')}
                  </span>
                </p>
              ))}

              <svg
                className="pointer-events-none absolute inset-0 block"
                width={canvasWidth}
                height={height}
                viewBox={`0 0 ${canvasWidth} ${height}`}
                aria-hidden
              >
                {edges.map((edge, index) => {
                  const source = placed.get(edge.source);
                  const target = placed.get(edge.target);
                  if (!source || !target) return null;
                  const lit = active === null || neighbours.has(source.node.slug) || neighbours.has(target.node.slug);
                  const { line, head } = edgePath(source, target, canvasWidth);
                  return (
                    <g key={index} opacity={active === null ? 0.5 : lit ? 0.95 : 0.07}>
                      <path
                        d={line}
                        fill="none"
                        stroke={EDGE_TONE[edge.kind]}
                        strokeWidth={edge.kind === 'strict' ? 1.5 : 1}
                        strokeDasharray={edge.kind === 'related' ? '4 4' : undefined}
                      />
                      <path d={head} fill="none" stroke={EDGE_TONE[edge.kind]} strokeWidth={1.4} strokeLinecap="round" />
                    </g>
                  );
                })}
              </svg>

              {[...placed.values()].map(({ node, x, y, w }) => {
                const isActive = node.slug === active;
                const dim = active !== null && !neighbours.has(node.slug);
                const counts = linkCounts.get(node.id) ?? { in: 0, out: 0 };
                return (
                  <Link
                    key={node.id}
                    to={`/explore/${node.slug}`}
                    onMouseEnter={() => setActive(node.slug)}
                    onMouseLeave={() => setActive((current) => (current === node.slug ? null : current))}
                    onFocus={() => setActive(node.slug)}
                    onBlur={() => setActive((current) => (current === node.slug ? null : current))}
                    className={cn(
                      'absolute flex flex-col gap-1 rounded-card border px-3 py-2 transition-colors',
                      isActive || node.slug === centerSlug
                        ? 'border-accent bg-accent-soft text-ink'
                        : 'border-line bg-sunken text-ink hover:border-[var(--border-strong)] hover:bg-raised',
                      dim && 'opacity-30'
                    )}
                    style={{ left: x, top: y, width: w, height: NODE_H }}
                  >
                    <p className="line-clamp-2 text-small-title font-semibold leading-snug">{node.name}</p>
                    <p className="truncate text-caption text-ink-muted">{node.subdomainName}</p>
                    <p className="mt-auto flex items-center justify-between gap-2 text-caption text-ink-muted">
                      <span className="truncate">{DIFFICULTY_LABEL[node.difficulty]}</span>
                      <span className="tnum shrink-0">{formatMinutes(node.estMinutes)}</span>
                    </p>
                    <p className="tnum text-caption text-ink-muted">
                      {counts.in === 0 ? 'no prerequisites' : `${counts.in} ${plural(counts.in, 'prerequisite')}`}
                      {counts.out > 0 ? ` · unlocks ${counts.out}` : ''}
                    </p>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          'min-h-16 rounded-card border border-line bg-sunken px-4 py-3 text-caption',
          !activeNode && 'text-ink-muted'
        )}
        aria-live="polite"
      >
        {activeNode ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="font-sans text-small-title font-semibold text-ink">{activeNode.name}</p>
              <p className="text-ink-muted">
                {activeNode.subdomainName} · {DIFFICULTY_LABEL[activeNode.difficulty]} ·{' '}
                {formatMinutes(activeNode.estMinutes)} · {neighbours.size - 1} direct{' '}
                {plural(neighbours.size - 1, 'link')}
              </p>
            </div>
            <Link
              to={`/explore/${activeNode.slug}`}
              className="shrink-0 rounded-input border border-line bg-raised px-2.5 py-1 font-medium text-ink transition-colors hover:border-[var(--border-strong)] hover:text-accent-hover"
            >
              Open topic
            </Link>
          </div>
        ) : (
          'Hover or focus a topic to highlight what it needs and what it unlocks.'
        )}
      </div>
    </div>
  );
}

/** The canvas lays out from its own measured width, so a single column becomes a stack on a phone. */
function useMeasuredWidth(host: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);
  return width;
}

function countsByNode(nodes: GraphNode[], edges: GraphEdge[]): Map<number, { in: number; out: number }> {
  const counts = new Map<number, { in: number; out: number }>(nodes.map((node) => [node.id, { in: 0, out: 0 }]));
  for (const edge of edges) {
    const target = counts.get(edge.target);
    if (target) target.in += 1;
    const source = counts.get(edge.source);
    if (source) source.out += 1;
  }
  return counts;
}
