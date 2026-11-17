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

  const [confirmingRestore, setConfirmingRestore] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

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
        setNotice(
          result.created === false
            ? `Refreshed recent snapshot: ${result.file} (clicked again within 30s) — see Backup History below.`
            : `Backup created successfully: ${result.file} — see Backup History below.`
        );
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

  // On success the app relaunches itself (electron/main.ts's
  // admin:restoreBackup handler) — this promise then never resolves, so
  // isRestoring is deliberately left true rather than reset in a
  // finally{}, keeping the row showing "Restoring..." until the app
  // actually restarts. Only the failure path resets state.
  async function confirmRestore(filename: string) {
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const result = await window.electron.admin.restoreBackup({ type: "local", filename });
      if (!result.success) {
        setRestoreError(`Restore failed: ${result.error}`);
        setIsRestoring(false);
        setConfirmingRestore(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setRestoreError(`Restore failed: ${message}`);
      setIsRestoring(false);
      setConfirmingRestore(null);
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

      {restoreError && <p className="err">{restoreError}</p>}

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
              <th className="actions-cell">Actions</th>
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
                <td className="actions-cell">
                  {isRestoring && confirmingRestore === b.file ? (
                    <span className="meta-line dim">Restoring — app will restart...</span>
                  ) : confirmingRestore === b.file ? (
                    <div className="table-actions">
                      <span className="meta-line dim">Restore this backup?</span>
                      <button className="btn-secondary sm" onClick={() => setConfirmingRestore(null)}>
                        Cancel
                      </button>
                      <button className="btn-primary sm" onClick={() => confirmRestore(b.file)}>
                        Confirm Restore
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn-secondary sm"
                      onClick={() => {
                        setRestoreError(null);
                        setConfirmingRestore(b.file);
                      }}
                      disabled={!b.verified || isRestoring}
                      title={!b.verified ? "This backup failed its integrity check and cannot be restored" : undefined}
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint" style={{ marginTop: 16 }}>
        Restoring replaces the current database with the selected backup. The application takes a fresh safety
        snapshot of what's currently on this computer first, then restarts automatically — nothing is discarded
        without a way back.
      </p>
    </section>
  );
}
