import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopicMap } from './TopicMap';
import type { GraphEdge, GraphNode } from '../../api/types';

const NODES: GraphNode[] = [
  node(1, 'linear-models', 'Linear models', 'beginner', 'Learning paradigms', 30),
  node(2, 'least-squares', 'Least squares', 'intermediate', 'Learning paradigms', 90),
  node(3, 'ridge-regression', 'Ridge regression', 'intermediate', 'Regularisation', 45)
];

const EDGES: GraphEdge[] = [
  { source: 1, target: 2, kind: 'strict' },
  { source: 1, target: 3, kind: 'recommended' },
  { source: 2, target: 3, kind: 'related' }
];

function node(
  id: number,
  slug: string,
  name: string,
  difficulty: GraphNode['difficulty'],
  subdomainName: string,
  estMinutes: number
): GraphNode {
  return { id, slug, name, difficulty, subdomainSlug: `sub-${difficulty}`, subdomainName, domainSlug: 'ml', estMinutes };
}

/** jsdom reports no layout, so the canvas is told how wide its host is instead of measuring it. */
function withWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

function renderMap(nodes = NODES, edges = EDGES) {
  return render(
    <MemoryRouter>
      <TopicMap nodes={nodes} edges={edges} />
    </MemoryRouter>
  );
}

function topOf(name: string): number {
  const card = screen.getByRole('link', { name: new RegExp(name, 'i') });
  return Number.parseInt(String(card.style.top), 10);
}

describe('TopicMap', () => {
  it('stacks the easier topic above the one that needs it', () => {
    withWidth(900);
    renderMap();
    expect(topOf('Linear models')).toBeLessThan(topOf('Least squares'));
    expect(topOf('Least squares')).toEqual(topOf('Ridge regression'));
  });

  it('writes the details a learner needs into the node itself', () => {
    withWidth(900);
    renderMap();
    const card = screen.getByRole('link', { name: /Least squares/i });
    expect(card).toHaveTextContent('Learning paradigms');
    expect(card).toHaveTextContent('Intermediate');
    expect(card).toHaveTextContent('1 h 30 m');
    expect(card).toHaveTextContent('1 prerequisite · unlocks 1');
    expect(card).toHaveAttribute('href', '/explore/least-squares');
  });

  it('marks a topic nobody needs anything before as an entry point', () => {
    withWidth(900);
    renderMap();
    expect(screen.getByRole('link', { name: /Linear models/i })).toHaveTextContent('no prerequisites · unlocks 2');
  });

  it('labels each band with its difficulty and how many topics it holds', () => {
    withWidth(900);
    renderMap();
    expect(screen.getByText('1 topic')).toBeInTheDocument();
    expect(screen.getByText('2 topics')).toBeInTheDocument();
    expect(screen.queryByText(/Expert/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Beginner/)).toHaveLength(2);
  });

  it('draws a connector and an arrowhead for every edge it can place', () => {
    withWidth(900);
    const { container } = renderMap();
    expect(container.querySelectorAll('svg path')).toHaveLength(EDGES.length * 2);
  });

  it('drops an edge that points at a topic the scope left out', () => {
    withWidth(900);
    const { container } = renderMap(NODES, [{ source: 1, target: 999, kind: 'strict' }]);
    expect(container.querySelectorAll('svg path')).toHaveLength(0);
  });

  it('lays one column per row when the container is only a phone wide', () => {
    withWidth(340);
    renderMap();
    const narrow = screen.getByRole('link', { name: /Ridge regression/i });
    const wide = screen.getByRole('link', { name: /Least squares/i });
    expect(Number.parseInt(narrow.style.left, 10)).toEqual(Number.parseInt(wide.style.left, 10));
    expect(Number.parseInt(narrow.style.top, 10)).toBeGreaterThan(Number.parseInt(wide.style.top, 10));
  });

  it('routes a same-band link around the cards instead of through them', () => {
    withWidth(340);
    const { container } = renderMap();
    const lines = Array.from(container.querySelectorAll('svg path')).map((path) => path.getAttribute('d') ?? '');
    const withinCanvas = lines.every((d) =>
      [...d.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].every(([, x]) => Number(x) >= 0 && Number(x) <= 340)
    );
    expect(withinCanvas, lines.join('\n')).toBe(true);
  });

  it('says so when a scope has nothing published', () => {
    withWidth(900);
    renderMap([], []);
    expect(screen.getByText(/no published topics to draw/i)).toBeInTheDocument();
  });
});
