// Minimal, dependency-free donut chart (plain SVG, stroke-based segments).
// Used for gender-wise distribution.
const PALETTE = ["var(--hg-600)", "#2f6fb0", "#c98a2a", "#8a5fb0", "#b45a5a"];

export default function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return <p className="chart-empty">No data yet.</p>;
  }

  const radius = 15.9155; // circumference = 100, makes percentage math direct
  const circumference = 2 * Math.PI * radius;
  let offsetAccum = 0;

  return (
    <div className="chart-donut">
      <svg viewBox="0 0 40 40" className="chart-donut-svg">
        <circle cx="20" cy="20" r={radius} fill="transparent" stroke="var(--line)" strokeWidth="6" />
        {data.map((d, i) => {
          const fraction = d.value / total;
          const dash = fraction * circumference;
          const dashArray = `${dash} ${circumference - dash}`;
          const dashOffset = -offsetAccum;
          offsetAccum += dash;
          return (
            <circle
              key={d.label}
              cx="20"
              cy="20"
              r={radius}
              fill="transparent"
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth="6"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 20 20)"
            >
              <title>{`${d.label}: ${d.value} (${Math.round(fraction * 100)}%)`}</title>
            </circle>
          );
        })}
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" className="chart-donut-total">
          {total}
        </text>
      </svg>
      <ul className="chart-legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="chart-legend-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.label} — {d.value} ({Math.round((d.value / total) * 100)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}
