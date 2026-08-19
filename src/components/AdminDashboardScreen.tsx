import { useEffect, useState } from "react";
import BarChart from "./charts/BarChart";
import HorizontalBarChart from "./charts/HorizontalBarChart";
import DonutChart from "./charts/DonutChart";
import type { AdminScreen } from "./AdminApp";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDayLabel(isoDate: string): string {
  // isoDate is "YYYY-MM-DD"
  const [, m, d] = isoDate.split("-");
  return `${Number(d)} ${MONTH_ABBR[Number(m) - 1]}`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminDashboardScreen({ onNavigate }: { onNavigate: (screen: AdminScreen) => void }) {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electron.admin
      .getAnalytics()
      .then((result) => {
        if (!cancelled) {
          setAnalytics(result);
          setLastUpdated(new Date());
        }
      })
      .catch((err) => {
        console.error("[AdminDashboard] Failed to load analytics:", err);
        if (!cancelled) setError("Could not load analytics.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2 className="panel-title no-border">Admin Dashboard</h2>
        {lastUpdated && <span className="meta-line dim">Last updated: {formatTime(lastUpdated)}</span>}
      </div>

      {error && <p className="err">{error}</p>}

      <div className="stats">
        <button className="stat-tile stat-tile-link" onClick={() => onNavigate("patients")}>
          <div className="stat-value">{analytics ? analytics.totalRegistrations : "—"}</div>
          <div className="stat-label">Total Registrations</div>
        </button>
        <button className="stat-tile stat-tile-link" onClick={() => onNavigate("consultants")}>
          <div className="stat-value">{analytics ? analytics.totalConsultantsActive : "—"}</div>
          <div className="stat-label">Active Consultants</div>
        </button>
        <button className="stat-tile stat-tile-link" onClick={() => onNavigate("diagnoses")}>
          <div className="stat-value">{analytics ? analytics.totalDiagnosesActive : "—"}</div>
          <div className="stat-label">Active Diagnoses</div>
        </button>
      </div>

      {analytics && (
        <div className="admin-charts">
          <div className="chart-card chart-card-wide">
            <h3 className="chart-card-title">Registrations — Last 30 Days</h3>
            <BarChart data={analytics.dailyCounts.map((d) => ({ label: formatDayLabel(d.date), value: d.count }))} />
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Gender-wise Distribution</h3>
            <DonutChart data={analytics.genderCounts.map((g) => ({ label: g.label, value: g.count }))} />
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Consultant-wise Distribution</h3>
            <HorizontalBarChart data={analytics.consultantCounts.map((c) => ({ label: c.label, value: c.count }))} />
          </div>

          <div className="chart-card">
            <h3 className="chart-card-title">Diagnosis-wise Distribution (Top 10)</h3>
            <HorizontalBarChart
              data={analytics.diagnosisCounts.map((d) => ({ label: d.label, value: d.count }))}
              color="#2f6fb0"
            />
          </div>
        </div>
      )}
    </section>
  );
}
