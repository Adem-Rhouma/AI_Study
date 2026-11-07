import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { ReactNode } from 'react';
import { TeX } from './Math';

/**
 * Interactive figures used by `interactive` lesson blocks. Each one is a self-contained numeric
 * simulation with no code evaluation: authors pick a `kind` and supply plain data, so nothing in a
 * lesson payload is ever executed.
 */

const AXIS = 'var(--border-strong)';
const LINE = 'var(--accent)';

function Frame({
  children,
  title,
  note,
  controls,
  height = 220
}: {
  children: ReactNode;
  title: string;
  note?: ReactNode;
  controls?: ReactNode;
  height?: number;
}) {
  return (
    <figure className="figure">
      <div className="figure-body space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <figcaption className="border-0 p-0 font-sans text-small-title font-semibold text-ink">{title}</figcaption>
          {controls}
        </div>
        <svg viewBox="0 0 480 220" width="100%" height={height} role="img" aria-label={title} className="overflow-visible">
          {children}
        </svg>
        {note && <div className="font-sans text-caption text-ink-secondary">{note}</div>}
      </div>
    </figure>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="flex min-w-40 flex-1 items-center gap-2 font-sans text-caption text-ink-secondary">
      <span className="w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-pill bg-[var(--border-strong)] accent-[var(--accent)]"
      />
      <span className="tnum w-14 shrink-0 text-right font-medium text-ink">{format ? format(value) : value}</span>
    </label>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-input border border-line bg-raised px-2 py-1 font-sans text-caption text-ink-secondary transition-colors hover:bg-sunken hover:text-ink"
    >
      <RotateCcw size={13} aria-hidden />
      Reset
    </button>
  );
}

/* ---------------------------------------------------------- gradient descent */

export type GradientDescentConfig = { start?: number; target?: number; steps?: number };

export function GradientDescent({ config }: { config: GradientDescentConfig }) {
  const target = config.target ?? 2;
  const start = config.start ?? -3;
  const maxSteps = config.steps ?? 20;
  const [lr, setLr] = useState(0.1);
  const [steps, setSteps] = useState(maxSteps);

  const path = useMemo(() => {
    const values: number[] = [start];
    let w = start;
    for (let i = 0; i < steps; i += 1) {
      const gradient = 2 * (w - target);
      w -= lr * gradient;
      values.push(w);
      if (!Number.isFinite(w) || Math.abs(w) > 1e6) break;
    }
    return values;
  }, [lr, steps, start, target]);

  const diverged = path.some((w) => !Number.isFinite(w) || Math.abs(w) > 40);
  const final = path[path.length - 1] ?? start;
  const loss = (w: number) => (w - target) ** 2;

  const xMin = -6;
  const xMax = 8;
  const yMax = 40;
  const toX = (w: number) => ((Math.max(xMin, Math.min(xMax, w)) - xMin) / (xMax - xMin)) * 460 + 10;
  const toY = (value: number) => 200 - (Math.min(value, yMax) / yMax) * 185;

  const curve = useMemo(() => {
    const points: string[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const w = xMin + ((xMax - xMin) * i) / 120;
      points.push(`${toX(w).toFixed(2)},${toY(loss(w)).toFixed(2)}`);
    }
    return points.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, lr]);

  return (
    <Frame
      title="Gradient descent on a quadratic"
      controls={<ResetButton onClick={() => { setLr(0.1); setSteps(maxSteps); }} />}
      note={
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-3">
            <Slider label="Learning rate" value={lr} min={0.005} max={1.2} step={0.005} onChange={setLr} format={(v) => v.toFixed(3)} />
            <Slider label="Steps" value={steps} min={1} max={maxSteps} step={1} onChange={setSteps} />
          </div>
          <p>
            Update rule <TeX latex="w_{k+1} = w_k - \eta \cdot 2(w_k - w^\ast)" /> with {' '}
            <TeX latex={`\\eta = ${lr.toFixed(3)}`} />. After {path.length - 1} step
            {path.length - 1 === 1 ? '' : 's'} the weight is <span className="tnum font-medium text-ink">{Number.isFinite(final) ? final.toFixed(4) : '∞'}</span>
            {diverged ? ' — the iterates diverged.' : ` (loss ${loss(final).toExponential(2)}).`}
          </p>
          <p className="text-ink-muted">
            Above <TeX latex="\eta = 1" /> the step overshoots and the loss grows; below it, convergence is slow but stable.
          </p>
        </div>
      }
    >
      <line x1="10" y1="200" x2="470" y2="200" stroke={AXIS} strokeWidth="1" />
      <line x1={toX(target)} y1="10" x2={toX(target)} y2="205" stroke={AXIS} strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={curve} fill="none" stroke={LINE} strokeWidth="2" />
      {path.slice(0, 60).map((w, index) =>
        Number.isFinite(w) ? (
          <circle
            key={index}
            cx={toX(w)}
            cy={toY(loss(w))}
            r={index === path.length - 1 ? 4.5 : 3}
            fill={diverged ? 'var(--danger)' : 'var(--accent)'}
            opacity={0.35 + (0.65 * index) / Math.max(1, path.length - 1)}
          />
        ) : null
      )}
      <text x={toX(target) + 6} y="22" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-sans)">
        w* = {target}
      </text>
    </Frame>
  );
}

/* --------------------------------------------------------- activation shapes */

const ACTIVATIONS: Record<string, { label: string; fn: (x: number) => number; latex: string }> = {
  relu: { label: 'ReLU', fn: (x) => Math.max(0, x), latex: '\\max(0, x)' },
  sigmoid: { label: 'Sigmoid', fn: (x) => 1 / (1 + Math.exp(-x)), latex: '\\sigma(x) = 1/(1+e^{-x})' },
  tanh: { label: 'Tanh', fn: (x) => Math.tanh(x), latex: '\\tanh(x)' },
  gelu: {
    label: 'GELU',
    fn: (x) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x ** 3))),
    latex: 'x\\,\\Phi(x)'
  },
  leaky: { label: 'Leaky ReLU', fn: (x) => (x > 0 ? x : 0.1 * x), latex: '\\max(0.1x, x)' }
};

const PALETTE = ['var(--accent)', 'var(--info)', 'var(--warning)', 'var(--success)', 'var(--mastery-3)'];

export function ActivationExplorer() {
  const [active, setActive] = useState<string[]>(['relu', 'sigmoid']);
  const [x, setX] = useState(1);

  const xMin = -4;
  const xMax = 4;
  const yMin = -1.5;
  const yMax = 4;
  const toX = (value: number) => ((value - xMin) / (xMax - xMin)) * 460 + 10;
  const toY = (value: number) => 200 - ((value - yMin) / (yMax - yMin)) * 190;

  return (
    <Frame
      title="Activation functions compared"
      controls={<ResetButton onClick={() => { setActive(['relu', 'sigmoid']); setX(1); }} />}
      note={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ACTIVATIONS).map(([key, item], index) => {
              const on = active.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setActive((current) => (on ? current.filter((k) => k !== key) : [...current, key]))
                  }
                  className={cn(
                    'cursor-pointer rounded-pill border px-2.5 py-1 font-sans text-caption transition-colors',
                    on ? 'border-transparent text-ink' : 'border-line text-ink-muted hover:text-ink'
                  )}
                  style={on ? { background: `color-mix(in oklab, ${PALETTE[index % PALETTE.length]} 22%, transparent)` } : undefined}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <Slider label="Input x" value={x} min={xMin} max={xMax} step={0.1} onChange={setX} format={(v) => v.toFixed(1)} />
          <ul className="grid gap-1 sm:grid-cols-2">
            {active.map((key) => {
              const item = ACTIVATIONS[key];
              if (!item) return null;
              const index = Object.keys(ACTIVATIONS).indexOf(key);
              return (
                <li key={key} className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-pill" style={{ background: PALETTE[index % PALETTE.length] }} />
                  <span className="font-medium text-ink">{item.label}</span>
                  <TeX latex={item.latex} />
                  <span className="tnum ml-auto font-mono text-[12px] text-ink-secondary">
                    f({x.toFixed(1)}) = {item.fn(x).toFixed(4)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      }
    >
      <line x1="10" y1={toY(0)} x2="470" y2={toY(0)} stroke={AXIS} strokeWidth="1" />
      <line x1={toX(0)} y1="10" x2={toX(0)} y2="205" stroke={AXIS} strokeWidth="1" />
      <line x1={toX(x)} y1="10" x2={toX(x)} y2="205" stroke={AXIS} strokeWidth="1" strokeDasharray="3 3" />
      {active.map((key) => {
        const item = ACTIVATIONS[key];
        if (!item) return null;
        const index = Object.keys(ACTIVATIONS).indexOf(key);
        const points: string[] = [];
        for (let i = 0; i <= 160; i += 1) {
          const value = xMin + ((xMax - xMin) * i) / 160;
          points.push(`${toX(value).toFixed(2)},${toY(item.fn(value)).toFixed(2)}`);
        }
        return (
          <g key={key}>
            <polyline points={points.join(' ')} fill="none" stroke={PALETTE[index % PALETTE.length]} strokeWidth="2" />
            <circle cx={toX(x)} cy={toY(item.fn(x))} r="4" fill={PALETTE[index % PALETTE.length]} />
          </g>
        );
      })}
    </Frame>
  );
}

/* ------------------------------------------------------ softmax temperature */

export type SoftmaxConfig = { logits?: number[]; labels?: string[] };

export function SoftmaxTemperature({ config }: { config: SoftmaxConfig }) {
  const logits = config.logits ?? [2.4, 1.2, 0.3, -0.8];
  const labels = config.labels ?? logits.map((_, index) => `class ${index + 1}`);
  const [temperature, setTemperature] = useState(1);

  const probs = useMemo(() => {
    const scaled = logits.map((logit) => logit / temperature);
    const max = Math.max(...scaled);
    const exps = scaled.map((value) => Math.exp(value - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((value) => value / sum);
  }, [logits, temperature]);

  const entropy = -probs.reduce((sum, p) => (p > 0 ? sum + p * Math.log(p) : sum), 0);
  const argmax = probs.indexOf(Math.max(...probs));

  return (
    <Frame
      title="Softmax temperature"
      height={200}
      controls={<ResetButton onClick={() => setTemperature(1)} />}
      note={
        <div className="space-y-2">
          <Slider
            label="Temperature T"
            value={temperature}
            min={0.1}
            max={5}
            step={0.05}
            onChange={setTemperature}
            format={(v) => v.toFixed(2)}
          />
          <p>
            <TeX latex={`p_i = \\frac{e^{z_i/T}}{\\sum_j e^{z_j/T}}`} /> — as <TeX latex="T \to 0" /> the distribution
            collapses onto <span className="font-medium text-ink">{labels[argmax]}</span>; as <TeX latex="T \to \infty" /> it
            approaches uniform. Entropy is <span className="tnum font-medium text-ink">{entropy.toFixed(3)} nats</span>{' '}
            (uniform would be {Math.log(probs.length).toFixed(3)}).
          </p>
        </div>
      }
    >
      {probs.map((p, index) => {
        const width = 380 / probs.length;
        const barHeight = Math.max(2, p * 170);
        return (
          <g key={index}>
            <rect
              x={30 + index * (width + 12)}
              y={190 - barHeight}
              width={width}
              height={barHeight}
              rx="3"
              fill={index === argmax ? 'var(--accent)' : 'var(--mastery-2)'}
              opacity={index === argmax ? 1 : 0.6}
            />
            <text
              x={30 + index * (width + 12) + width / 2}
              y={205}
              fontSize="11"
              textAnchor="middle"
              fill="var(--text-muted)"
              fontFamily="var(--font-sans)"
            >
              {labels[index] ?? index}
            </text>
            <text
              x={30 + index * (width + 12) + width / 2}
              y={185 - barHeight}
              fontSize="11"
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontFamily="var(--font-mono)"
            >
              {(p * 100).toFixed(1)}%
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

/* ------------------------------------------------------------- Bayes update */

export function BayesUpdater() {
  const [prior, setPrior] = useState(0.2);
  const [likelihood, setLikelihood] = useState(0.9);
  const [falsePositive, setFalsePositive] = useState(0.15);

  const posterior = (prior * likelihood) / (prior * likelihood + (1 - prior) * falsePositive);
  const factor = likelihood / falsePositive;

  return (
    <Frame
      title="One piece of evidence, one update"
      height={170}
      controls={
        <ResetButton
          onClick={() => {
            setPrior(0.2);
            setLikelihood(0.9);
            setFalsePositive(0.15);
          }}
        />
      }
      note={
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <Slider label="Prior P(H)" value={prior} min={0.01} max={0.99} step={0.01} onChange={setPrior} format={(v) => v.toFixed(2)} />
            <Slider label="P(E|H)" value={likelihood} min={0.01} max={1} step={0.01} onChange={setLikelihood} format={(v) => v.toFixed(2)} />
            <Slider label="P(E|¬H)" value={falsePositive} min={0.01} max={1} step={0.01} onChange={setFalsePositive} format={(v) => v.toFixed(2)} />
          </div>
          <p>
            Posterior <TeX latex={`P(H \\mid E) = ${posterior.toFixed(4)}`} />. The likelihood ratio is{' '}
            <TeX latex={`\\frac{P(E \\mid H)}{P(E \\mid \\neg H)} = ${factor.toFixed(2)}`} />, so the odds are multiplied by
            that factor — but a strong ratio still cannot rescue an implausible prior.
          </p>
        </div>
      }
    >
      <text x="10" y="30" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-sans)">
        Prior
      </text>
      <rect x="60" y="18" width={400 * prior} height="18" rx="3" fill="var(--mastery-2)" />
      <rect x="60" y="18" width="400" height="18" rx="3" fill="none" stroke={AXIS} />
      <text x="60" y="90" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-sans)">
        Posterior
      </text>
      <rect x="60" y="78" width={400 * posterior} height="18" rx="3" fill="var(--accent)" />
      <rect x="60" y="78" width="400" height="18" rx="3" fill="none" stroke={AXIS} />
      <text x="60" y="140" fontSize="12" fill="var(--text-secondary)" fontFamily="var(--font-mono)">
        {(prior * 100).toFixed(1)}% → {(posterior * 100).toFixed(1)}%
      </text>
    </Frame>
  );
}

export type InteractiveConfig = Record<string, unknown>;

export function Interactive({ kind, config }: { kind: string; config: InteractiveConfig }) {
  switch (kind) {
    case 'gradient-descent':
      return <GradientDescent config={config as GradientDescentConfig} />;
    case 'activation':
      return <ActivationExplorer />;
    case 'softmax-temperature':
      return <SoftmaxTemperature config={config as SoftmaxConfig} />;
    case 'bayes':
      return <BayesUpdater />;
    default:
      return (
        <div className="callout warning">
          <span className="callout-label">Interactive not available</span>
          <div className="callout-body font-sans">
            This lesson references an interactive figure (<code className="font-mono">{kind || 'unknown'}</code>) that this
            build does not implement. The surrounding text still explains the idea.
          </div>
        </div>
      );
  }
}
