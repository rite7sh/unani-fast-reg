import { useEffect, useState } from "react";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminBackupScreen() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [history, setHistory] = useState<BackupFileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  function load() {
    window.electron.db
      .getBackupStatus()
      .then(setStatus)
      .catch((err) => console.error("[AdminBackup] getBackupStatus failed:", err));
    window.electron.admin
      .listBackups()
      .then(setHistory)
      .catch((err) => {
        console.error("[AdminBackup] listBackups failed:", err);
        setError("Could not load backup history.");
      });
  }

  useEffect(load, []);

  async function backupNow() {
    setIsBackingUp(true);
    setNotice(null);
    setError(null);
    try {
      const result = await window.electron.admin.createBackupNow();
      if (result.success) {
        setNotice(`Backup created: ${result.file}`);
        load();
      } else {
        setError(`Backup failed: ${result.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Backup failed: ${message}`);
    } finally {
      setIsBackingUp(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Backup</h2>

      {notice && <p className="succ-note">{notice}</p>}
      {error && <p className="err">{error}</p>}

      <div className="stats">
        <div className="stat-tile">
          <div className="stat-value" style={{ fontSize: 18 }}>
            {status ? (status.lastBackupVerified ? "Verified" : status.lastBackupFile ? "Issue" : "None yet") : "—"}
          </div>
          <div className="stat-label">Last Backup Status</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ fontSize: 18 }}>
            {status?.lastBackupAt ? formatDateTime(status.lastBackupAt) : "—"}
          </div>
          <div className="stat-label">Last Backup Time</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value">{status ? status.retainedCount : "—"}</div>
          <div className="stat-label">Retained Backups (max 14)</div>
        </div>
      </div>

      <div className="actions bar">
        <button className="btn-primary" onClick={backupNow} disabled={isBackingUp}>
          {isBackingUp ? "Backing up..." : "Backup Now"}
        </button>
      </div>

      <h2 className="panel-title" style={{ marginTop: 24 }}>
        Backup History
      </h2>
      {history.length === 0 ? (
        <p className="empty-note">No backups yet.</p>
      ) : (
        <table className="hist-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Created</th>
              <th>Size</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={b.file}>
                <td>{b.file}</td>
                <td>{formatDateTime(b.createdAt)}</td>
                <td>{formatSize(b.sizeBytes)}</td>
                <td>
                  <span className={b.verified ? "status-badge active" : "status-badge inactive"}>
                    {b.verified ? "Verified" : "Issue"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        Restore-from-backup is planned for a future update — it needs a safe way to swap the live database file
        without risking data loss mid-operation, so it isn't available yet. Contact support if you need a backup
        restored in the meantime.
      </p>
    </section>
  );
}
