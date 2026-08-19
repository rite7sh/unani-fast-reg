// Minimal, dependency-free vertical bar chart (plain SVG). Used for the
// daily registrations trend. No charting library is installed in this
// project and none is added here — see project constraints.
export default function BarChart({
  data,
  height = 160,
  color = "var(--hg-600)",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
}) {
  if (data.length === 0) {
    return <p className="chart-empty">No data yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth = 100 / data.length;
  // Avoid a cluttered x-axis when there are many bars (e.g. 30 days) —
  // show at most ~8 evenly-spaced labels.
  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="chart-bar">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="chart-bar-svg">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * (height - 20);
          const x = i * barWidth;
          return (
            <rect
              key={d.label}
              x={x + barWidth * 0.15}
              y={height - 20 - barHeight}
              width={barWidth * 0.7}
              height={barHeight}
              rx={0.6}
              fill={color}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
        <line x1={0} y1={height - 20} x2={100} y2={height - 20} stroke="var(--line)" strokeWidth={0.5} />
      </svg>
      <div className="chart-bar-labels">
        {data.map((d, i) =>
          i % labelStride === 0 ? (
            <span key={d.label} className="chart-bar-label" style={{ width: `${barWidth}%` }}>
              {d.label}
            </span>
          ) : (
            <span key={d.label} className="chart-bar-label" style={{ width: `${barWidth}%` }} />
          )
        )}
      </div>
    </div>
  );
}
