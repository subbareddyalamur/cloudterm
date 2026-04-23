interface PlatformData {
  name: string;
  count: number;
  color: string;
}

interface PlatformPieProps {
  platforms: PlatformData[];
  size?: number;
}

export function PlatformPie({ platforms, size = 120 }: PlatformPieProps) {
  const total = platforms.reduce((s, p) => s + p.count, 0);
  if (total === 0) return <div className="w-[120px] h-[120px] rounded-full bg-elev" />;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.82;

  let angle = -90;
  const slices = platforms.map((p) => {
    const startAngle = angle;
    const sweep = (p.count / total) * 360;
    angle += sweep;
    return { ...p, startAngle, sweep };
  });

  function polarToXY(deg: number, radius: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(startDeg: number, sweepDeg: number) {
    if (sweepDeg >= 360) sweepDeg = 359.999;
    const s = polarToXY(startDeg, r);
    const e = polarToXY(startDeg + sweepDeg, r);
    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  }

  return (
    <svg width={size} height={size} aria-label="Platform distribution pie chart">
      {slices.map((s) => (
        <path key={s.name} d={arcPath(s.startAngle, s.sweep)} fill={s.color} opacity="0.85" />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="var(--surface)" />
    </svg>
  );
}
