import { useEffect, useState } from "react";
import AppHeader from "./AppHeader";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DashboardScreen({
  employee,
  onLogout,
  onNavigateRegister,
  onNavigateHistory,
}: {
  employee: string;
  onLogout: () => void;
  onNavigateRegister: () => void;
  onNavigateHistory: () => void;
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.electron.db
      .getDashboardStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to load stats:", err);
        if (!cancelled) setError("Could not load registration counts.");
      });

    window.electron.db
      .getBackupStatus()
      .then((result) => {
        if (!cancelled) setBackupStatus(result);
      })
      .catch((err) => {
        console.error("[Dashboard] Failed to load backup status:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <AppHeader employee={employee} onLogout={onLogout} />

      <main className="page">
        <section className="panel">
          <h2 className="panel-title">Employee Dashboard</h2>

          {error && <p className="err">{error}</p>}

          <div className="stats">
            <div className="stat-tile">
              <div className="stat-value">{stats ? stats.todayCount : "—"}</div>
              <div className="stat-label">Today's Registrations</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">{stats ? stats.totalCount : "—"}</div>
              <div className="stat-label">Total Registrations</div>
            </div>
          </div>

          <div className="dash-actions">
            <button className="dash-card" onClick={onNavigateRegister}>
              <span className="dash-card-title">Register New Patient</span>
              <span className="dash-card-desc">Start a new OPD registration</span>
            </button>
            <button className="dash-card" onClick={onNavigateHistory}>
              <span className="dash-card-title">Patient History</span>
              <span className="dash-card-desc">Search previously registered patients</span>
            </button>
          </div>

          {backupStatus && (
            <p className={backupStatus.lastBackupVerified ? "meta-line dim backup-status" : "err backup-status"}>
              {backupStatus.lastBackupVerified
                ? `Backup: verified ${formatDateTime(backupStatus.lastBackupAt as string)} · ${backupStatus.retainedCount} retained`
                : backupStatus.lastBackupFile
                  ? `Backup: verification issue on last backup · ${backupStatus.retainedCount} retained`
                  : "Backup: none yet"}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
