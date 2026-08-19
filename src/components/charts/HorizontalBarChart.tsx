// Minimal, dependency-free horizontal bar chart (plain SVG + CSS width),
// used for consultant-wise and diagnosis-wise distribution — label
// legibility matters more than a fixed grid here, so this renders as
// simple proportional-width bars rather than an SVG plot.
export default function HorizontalBarChart({
  data,
  color = "var(--hg-600)",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0) {
    return <p className="chart-empty">No data yet.</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="chart-hbar">
      {data.map((d) => (
        <div className="chart-hbar-row" key={d.label}>
          <span className="chart-hbar-label" title={d.label}>
            {d.label}
          </span>
          <div className="chart-hbar-track">
            <div
              className="chart-hbar-fill"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="chart-hbar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
