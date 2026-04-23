interface SparklineProps {
  points?: number[] | null;
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({ points, color = 'var(--accent)', width = 80, height = 28 }: SparklineProps) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 2;

  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (width - pad * 2));
  const ys = points.map((v) => height - pad - ((v - min) / range) * (height - pad * 2));

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const areaPath = `${linePath} L${xs[xs.length - 1]},${height} L${xs[0]},${height} Z`;

  return (
    <svg width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <path d={linePath} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
