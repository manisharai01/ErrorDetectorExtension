// Small presentational helpers shared across pages (server-safe, no client JS).

export function scoreClass(score: number): string {
  return score >= 80 ? 'good' : score >= 60 ? 'mid' : 'bad';
}

export function Score({ value }: { value: number }) {
  return <span className={`score ${scoreClass(value)}`}>{value}</span>;
}

export function SeverityPill({ severity }: { severity: string }) {
  return <span className={`pill ${severity}`}>{severity}</span>;
}

/** Interpolate a risk value (0..100) to a heat color (green → amber → red). */
export function riskColor(risk: number): string {
  const r = Math.max(0, Math.min(100, risk)) / 100;
  // 0 → green (hue 140), 100 → red (hue 0). Fixed saturation/lightness.
  const hue = Math.round(140 * (1 - r));
  return `hsl(${hue}, 70%, 45%)`;
}

/** A risk chip: the number on its heat color. */
export function RiskChip({ risk }: { risk: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        minWidth: 34,
        textAlign: 'center',
        padding: '2px 8px',
        borderRadius: 6,
        color: '#fff',
        fontWeight: 600,
        background: riskColor(risk)
      }}
    >
      {risk}
    </span>
  );
}

export function Sparkline({
  points,
  width = 200,
  height = 40
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (!points.length) return <span className="muted">no data</span>;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const d = points
    .map((p, i) => {
      const x = (i * step).toFixed(1);
      const y = (height - ((p - min) / range) * height).toFixed(1);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label="trend">
      <path d={d} fill="none" stroke="#4f8ef7" strokeWidth={2} />
    </svg>
  );
}
