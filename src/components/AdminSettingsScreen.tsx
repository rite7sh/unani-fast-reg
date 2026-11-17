import { useEffect, useState, type FormEvent, type ReactNode } from "react";

// Re-enabled for the LAN prototype demo, to show the Cloud Backup / Data
// Sync architecture live — every piece of state, IPC call, and
// status-fetching below was already fully intact while this was false, so
// this is purely a visibility flip, not a functional change. See the
// matching flag in RegistrationScreen.tsx for the other customer-facing
// Sync control.
const SHOW_CLOUD_FEATURES = true;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Shared header for each of the four settings sections below — an icon,
// title, and one-line purpose description, so a section is identifiable
// at a glance without reading its body. `tone` gives each section its own
// icon color; Cloud Backup and Data Sync deliberately get different tones
// (blue vs violet) on top of being separate cards, since those two are the
// pair most likely to be mistaken for each other.
function SectionHeader({
  tone,
  icon,
  title,
  description,
}: {
  tone: "neutral" | "backup" | "cloud" | "sync";
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="settings-section-head">
      <span className={`settings-icon tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className="settings-section-title">{title}</h3>
        <p className="settings-section-desc">{description}</p>
      </div>
    </div>
  );
}

const LockIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const DiskIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M8 3v6h8V3" />
    <path d="M7 21v-7h10v7" />
  </svg>
);

const CloudIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8.2 4 4 0 0 1 17 18H7Z" />
  </svg>
);

const SyncIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 11A8 8 0 0 0 5.6 6.6M4 4v5h5" />
    <path d="M4 13a8 8 0 0 0 14.4 4.4M20 20v-5h-5" />
  </svg>
);

export default function AdminSettingsScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.electron.admin.changePassword(currentPassword, newPassword);
      if (result.success) {
        setNotice("Admin password updated.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError("Current password is incorrect.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not change password: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---- Local backup location ----
  const [backupLocation, setBackupLocationState] = useState<BackupLocationInfo | null>(null);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isBackingUp, setIsBackingUp] = useState(false);

  // ---- Cloud backup ----
  const [cloudStatus, setCloudStatus] = useState<CloudBackupStatus | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudNotice, setCloudNotice] = useState("");
  const [cloudError, setCloudError] = useState("");

  // ---- Data sync — deliberately separate state from both backup sections
  // above: Sync sends/receives current patient records, it never touches a
  // backup snapshot. See loadSyncStatus()/syncNow() below.
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [syncError, setSyncError] = useState("");

  // ---- LAN Sync Server — lives inside the Data Sync card (not a separate
  // section): this is the same sync feature above, just describing where
  // its server lives when this PC is hosting it for Reception. Starting/
  // stopping this never changes the sync behavior itself.
  const [lanStatus, setLanStatus] = useState<LanServerStatus | null>(null);
  const [lanBusy, setLanBusy] = useState(false);
  const [lanNotice, setLanNotice] = useState("");
  const [lanError, setLanError] = useState("");
  const [pairingCode, setPairingCode] = useState<LanPairingCode | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState("");

  function loadBackupInfo() {
    window.electron.admin
      .getBackupLocation()
      .then(setBackupLocationState)
      .catch((err) => console.error("[Settings] getBackupLocation failed:", err));
    window.electron.db
      .getBackupStatus()
      .then(setBackupStatus)
      .catch((err) => console.error("[Settings] getBackupStatus failed:", err));
    window.electron.admin
      .getCloudBackupStatus()
      .then(setCloudStatus)
      .catch((err) => console.error("[Settings] getCloudBackupStatus failed:", err));
  }

  useEffect(loadBackupInfo, []);

  function loadSyncStatus() {
    window.electron.sync
      .getStatus()
      .then(setSyncStatus)
      .catch((err) => console.error("[Settings] getSyncStatus failed:", err));
  }

  useEffect(loadSyncStatus, []);

  function loadLanStatus() {
    window.electron.admin
      .getLanServerStatus()
      .then(setLanStatus)
      .catch((err) => console.error("[Settings] getLanServerStatus failed:", err));
  }

  useEffect(loadLanStatus, []);

  async function changeLocation() {
    setLocationBusy(true);
    setLocationNotice("");
    setLocationError("");
    try {
      const result = await window.electron.admin.chooseBackupLocation();
      if (result.canceled) {
        // User closed the folder picker without choosing anything — not an error.
      } else if (result.success) {
        setLocationNotice(`Backup location set to: ${result.location}`);
        loadBackupInfo();
      } else {
        setLocationError(result.error || "Could not use that folder.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocationError(`Could not change location: ${message}`);
    } finally {
      setLocationBusy(false);
    }
  }

  async function resetToDefaultLocation() {
    setLocationBusy(true);
    setLocationNotice("");
    setLocationError("");
    try {
      await window.electron.admin.clearBackupLocation();
      setLocationNotice("Reverted to the default backup location.");
      loadBackupInfo();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocationError(`Could not reset location: ${message}`);
    } finally {
      setLocationBusy(false);
    }
  }

  async function openBackupFolder() {
    setLocationError("");
    try {
      const result = await window.electron.admin.openBackupFolder();
      if (!result.success) {
        setLocationError(result.error || "Could not open the backup folder.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocationError(`Could not open the backup folder: ${message}`);
    }
  }

  async function backupNow() {
    setIsBackingUp(true);
    setLocationNotice("");
    setLocationError("");
    try {
      const result = await window.electron.admin.createBackupNow();
      if (result.success) {
        setLocationNotice(
          result.created === false
            ? `Refreshed recent snapshot: ${result.file} (clicked again within 30s) — saved to your backup folder below.`
            : `Backup created successfully: ${result.file} — saved to your backup folder below.`
        );
      } else {
        setLocationError(`Backup failed: ${result.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocationError(`Backup failed: ${message}`);
    } finally {
      // Always refresh, not just on success — a failed attempt still
      // updates the persisted lastError the status tiles read from, and
      // that must never show stale (previously-successful) status.
      loadBackupInfo();
      setIsBackingUp(false);
    }
  }

  async function uploadNow() {
    setCloudBusy(true);
    setCloudNotice("");
    setCloudError("");
    try {
      const result = await window.electron.admin.uploadBackupNow();
      if (result.success) {
        setCloudNotice(result.status === "already-current" ? "Cloud copy is already up to date." : "Uploaded to cloud storage.");
      } else {
        setCloudError(`Upload failed: ${result.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setCloudError(`Upload failed: ${message}`);
    } finally {
      loadBackupInfo();
      setCloudBusy(false);
    }
  }

  async function syncNow() {
    setSyncBusy(true);
    setSyncNotice("");
    setSyncError("");
    try {
      const result = await window.electron.sync.syncNow();
      if (result.success) {
        setSyncNotice(`Synced — ${result.push.pushed} record(s) sent, ${result.pull.pulled} received.`);
      } else {
        setSyncError(`Sync failed: ${result.push.error || result.pull.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSyncError(`Sync failed: ${message}`);
    } finally {
      loadSyncStatus();
      setSyncBusy(false);
    }
  }

  async function startLan() {
    setLanBusy(true);
    setLanNotice("");
    setLanError("");
    setPairingCode(null);
    try {
      const status = await window.electron.admin.startLanServer();
      setLanStatus(status);
      if (status.running) {
        setLanNotice("LAN sync server started.");
      } else {
        setLanError(status.lastError || "Could not start the LAN sync server.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLanError(`Could not start the LAN sync server: ${message}`);
    } finally {
      setLanBusy(false);
    }
  }

  async function stopLan() {
    setLanBusy(true);
    setLanNotice("");
    setLanError("");
    setPairingCode(null);
    try {
      const status = await window.electron.admin.stopLanServer();
      setLanStatus(status);
      setLanNotice("LAN sync server stopped.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLanError(`Could not stop the LAN sync server: ${message}`);
    } finally {
      setLanBusy(false);
    }
  }

  async function restartLan() {
    setLanBusy(true);
    setLanNotice("");
    setLanError("");
    setPairingCode(null);
    try {
      const status = await window.electron.admin.restartLanServer();
      setLanStatus(status);
      if (status.running) {
        setLanNotice("LAN sync server restarted.");
      } else {
        setLanError(status.lastError || "Could not restart the LAN sync server.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLanError(`Could not restart the LAN sync server: ${message}`);
    } finally {
      setLanBusy(false);
    }
  }

  async function generateCode() {
    setPairingBusy(true);
    setPairingError("");
    try {
      const result = await window.electron.admin.generateLanPairingCode();
      setPairingCode(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPairingError(`Could not generate a setup code: ${message}`);
    } finally {
      setPairingBusy(false);
    }
  }

  function copyAddress(address: string) {
    navigator.clipboard.writeText(`http://${address}:${lanStatus?.port ?? ""}`).catch(() => {
      // Clipboard access denied — the address is still visible on screen to copy by hand.
    });
  }

  // Two distinct "not an error" phrasings, both from productionConfig.ts:
  // "is not reachable right now" (describeConnectionFailure — dev/prototype
  // with no server running) and "is not configured on this installation"
  // (requireApiBaseUrl/getDeviceSetupToken — a packaged build with no
  // production.env yet, confirmed via testing the actual packaged app to
  // be the state a customer demo build is normally in). Both get the same
  // calm label instead of sharing the word "Error" with an actual problem
  // (bad credentials, a real server-side failure, etc.).
  function isConnectionUnavailable(message: string | null | undefined): boolean {
    return !!message && (message.includes("is not reachable right now") || message.includes("is not configured on this installation"));
  }

  const cloudStatusLabel = !cloudStatus
    ? "—"
    : isConnectionUnavailable(cloudStatus.lastError)
    ? "Not Available"
    : cloudStatus.lastError
    ? "Error"
    : cloudStatus.configured
    ? "Connected"
    : "Not configured";

  const syncStatusLabel = !syncStatus
    ? "—"
    : isConnectionUnavailable(syncStatus.lastPushError) || isConnectionUnavailable(syncStatus.lastPullError)
    ? "Not Available"
    : syncStatus.lastPushError || syncStatus.lastPullError
    ? "Error"
    : syncStatus.pendingPushCount > 0
    ? "Pending"
    : "Up to date";
  const syncStatusBadgeClass =
    syncStatusLabel === "Up to date" ? "status-badge active" : syncStatusLabel === "Pending" ? "status-badge pending" : "status-badge inactive";

  return (
    <section className="panel">
      <h2 className="panel-title">Settings</h2>

      <div className="settings-section">
        <SectionHeader
          tone="neutral"
          icon={LockIcon}
          title="Password & Security"
          description="Change the password required to open the Admin area."
        />

        <form onSubmit={submit} style={{ maxWidth: 360 }}>
          <label className="lbl" htmlFor="cur-pw">
            Current Password
          </label>
          <input
            id="cur-pw"
            type="password"
            className="inp"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />

          <label className="lbl" htmlFor="new-pw" style={{ marginTop: 12 }}>
            New Password
          </label>
          <input
            id="new-pw"
            type="password"
            className="inp"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />

          <label className="lbl" htmlFor="new-pw-confirm" style={{ marginTop: 12 }}>
            Confirm New Password
          </label>
          <input
            id="new-pw-confirm"
            type="password"
            className="inp"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {notice && <p className="succ-note">{notice}</p>}
          {error && <p className="err">{error}</p>}

          <div className="actions bar">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Updating..." : "Change Password"}
            </button>
          </div>
        </form>
      </div>

      <div className="settings-section">
        <SectionHeader
          tone="backup"
          icon={DiskIcon}
          title="Local Backup"
          description="Choose where recovery copies are saved on this computer, and create one whenever you like."
        />

        {locationNotice && <p className="succ-note">{locationNotice}</p>}
        {locationError && <p className="err">{locationError}</p>}

        <div className="detail-grid" style={{ marginTop: 10 }}>
          <div className="detail-row span2">
            <span className="lbl">Current Location</span>
            <div className="detail-value">
              {backupLocation?.location ?? backupLocation?.defaultLocation ?? "—"}
              {!backupLocation?.location && <span className="meta-line dim"> (default)</span>}
            </div>
          </div>
          <div className="detail-row">
            <span className="lbl">Last Backup</span>
            <div className="detail-value">{backupStatus?.lastBackupAt ? formatDateTime(backupStatus.lastBackupAt) : "—"}</div>
          </div>
          <div className="detail-row">
            <span className="lbl">Status</span>
            <div className="detail-value">
              {backupStatus ? (backupStatus.lastBackupVerified ? "Verified" : backupStatus.lastBackupFile ? "Issue" : "None yet") : "—"}
            </div>
          </div>
          {backupStatus?.customLocation && backupStatus.customLocationLastError && (
            <div className="detail-row span2">
              <span className="lbl">Custom Location Issue</span>
              <div className="detail-value" style={{ color: "var(--danger)" }}>
                {backupStatus.customLocationLastError} — the default location above is still being backed up normally.
              </div>
            </div>
          )}
        </div>

        <div className="actions bar">
          {backupLocation?.location && (
            <button className="btn-secondary" onClick={resetToDefaultLocation} disabled={locationBusy}>
              Reset to Default
            </button>
          )}
          <button className="btn-secondary" onClick={changeLocation} disabled={locationBusy}>
            Change Location
          </button>
          <button className="btn-secondary" onClick={openBackupFolder}>
            Open Backup Folder
          </button>
          <button className="btn-primary" onClick={backupNow} disabled={isBackingUp}>
            {isBackingUp ? "Backing up..." : "Back Up Now"}
          </button>
        </div>
      </div>

      {SHOW_CLOUD_FEATURES && (
        <div className="settings-section">
          <SectionHeader
            tone="cloud"
            icon={CloudIcon}
            title="Cloud Backup"
            description="Keeps an extra recovery copy of your data safe outside this computer, in case something happens to it."
          />

          {cloudNotice && <p className="succ-note">{cloudNotice}</p>}
          {cloudError && <p className="err">{cloudError}</p>}

          <div className="detail-grid" style={{ marginTop: 10 }}>
            <div className="detail-row">
              <span className="lbl">Status</span>
              <div className="detail-value">
                <span className={cloudStatusLabel === "Connected" ? "status-badge active" : "status-badge inactive"}>
                  {cloudStatusLabel}
                </span>
              </div>
            </div>
            <div className="detail-row">
              <span className="lbl">Last Successful Upload</span>
              <div className="detail-value">
                {cloudStatus?.lastUploadAt ? `${formatDateTime(cloudStatus.lastUploadAt)} — ${cloudStatus.lastUploadFile}` : "—"}
              </div>
            </div>
            {cloudStatus?.lastError && (
              <div className="detail-row span2">
                <span className="lbl">Last Error</span>
                <div className="detail-value" style={{ color: "var(--danger)" }}>
                  {cloudStatus.lastError}
                </div>
              </div>
            )}
          </div>

          <div className="actions bar">
            <button className="btn-primary" onClick={uploadNow} disabled={cloudBusy}>
              {cloudBusy ? "Uploading..." : "Upload Backup Now"}
            </button>
          </div>

          <p className="hint" style={{ marginTop: 16 }}>
            This sends a recovery copy of all patient data to secure off-site storage — it never changes or deletes
            anything on this computer. A copy also uploads automatically in the background whenever a backup is made
            here, and each time this application opens and closes. If the upload can't complete (for example, no
            internet connection), the local backup above is unaffected and registration keeps working normally.
          </p>
        </div>
      )}

      {SHOW_CLOUD_FEATURES && (
        <div className="settings-section">
          <SectionHeader
            tone="sync"
            icon={SyncIcon}
            title="Data Sync"
            description="Keeps patient records up to date between Reception and this application — separate from Backup above."
          />

          {syncNotice && <p className="succ-note">{syncNotice}</p>}
          {syncError && <p className="err">{syncError}</p>}

          <div className="detail-grid" style={{ marginTop: 10 }}>
            <div className="detail-row">
              <span className="lbl">Status</span>
              <div className="detail-value">
                <span className={syncStatusBadgeClass}>{syncStatusLabel}</span>
              </div>
            </div>
            <div className="detail-row">
              <span className="lbl">Last Synced</span>
              <div className="detail-value">{syncStatus?.lastPullAt ? formatDateTime(syncStatus.lastPullAt) : "—"}</div>
            </div>
            <div className="detail-row">
              <span className="lbl">Pending Local Changes</span>
              <div className="detail-value">{syncStatus ? syncStatus.pendingPushCount : "—"}</div>
            </div>
            {(syncStatus?.lastPullError || syncStatus?.lastPushError) && (
              <div className="detail-row span2">
                <span className="lbl">Last Error</span>
                <div className="detail-value" style={{ color: "var(--danger)" }}>
                  {syncStatus?.lastPullError || syncStatus?.lastPushError}
                </div>
              </div>
            )}
          </div>

          <div className="actions bar">
            <button className="btn-primary" onClick={syncNow} disabled={syncBusy}>
              {syncBusy ? "Syncing..." : "Sync Now"}
            </button>
          </div>

          <p className="hint" style={{ marginTop: 16 }}>
            Sync brings this application's Dashboard, Patients and Reports up to date with what Reception has entered,
            and sends any changes made here back to Reception — it does not create or change a backup file. It runs
            automatically every 2 hours and once each time this application opens; use Sync Now for an immediate
            update.
          </p>

          <div className="settings-subsection" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <h4 className="settings-section-title" style={{ fontSize: 14 }}>
              LAN Sync Server
            </h4>
            <p className="settings-section-desc">
              Let Reception connect to this computer directly over your hospital network, instead of the internet.
            </p>

            {lanNotice && <p className="succ-note">{lanNotice}</p>}
            {lanError && <p className="err">{lanError}</p>}

            <div className="detail-grid" style={{ marginTop: 10 }}>
              <div className="detail-row">
                <span className="lbl">Status</span>
                <div className="detail-value">
                  <span className={lanStatus?.running ? "status-badge active" : "status-badge inactive"}>
                    {lanStatus?.running ? "Running" : "Stopped"}
                  </span>
                </div>
              </div>
              {lanStatus?.running && lanStatus.addresses.length > 0 && (
                <div className="detail-row span2">
                  <span className="lbl">Server Address{lanStatus.addresses.length > 1 ? "es" : ""}</span>
                  <div className="detail-value">
                    {lanStatus.addresses.map((address) => (
                      <div key={address} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code>
                          {address}:{lanStatus.port}
                        </code>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: "2px 8px", fontSize: 12 }}
                          onClick={() => copyAddress(address)}
                        >
                          Copy
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="actions bar">
              {lanStatus?.running ? (
                <>
                  <button className="btn-secondary" onClick={restartLan} disabled={lanBusy}>
                    {lanBusy ? "Working..." : "Restart Server"}
                  </button>
                  <button className="btn-secondary" onClick={stopLan} disabled={lanBusy}>
                    {lanBusy ? "Working..." : "Stop Server"}
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={startLan} disabled={lanBusy}>
                  {lanBusy ? "Starting..." : "Start LAN Sync Server"}
                </button>
              )}
            </div>

            {lanStatus?.running && (
              <div style={{ marginTop: 16 }}>
                {pairingError && <p className="err">{pairingError}</p>}
                {pairingCode ? (
                  <div className="detail-grid">
                    <div className="detail-row">
                      <span className="lbl">Reception Setup Code</span>
                      <div className="detail-value">
                        <code style={{ fontSize: 16, letterSpacing: 1 }}>{pairingCode.code}</code>
                      </div>
                    </div>
                    <div className="detail-row">
                      <span className="lbl">Expires At</span>
                      <div className="detail-value">{formatDateTime(pairingCode.expiresAt)}</div>
                    </div>
                  </div>
                ) : null}
                <div className="actions bar" style={{ marginTop: pairingCode ? 10 : 0 }}>
                  <button className="btn-secondary" onClick={generateCode} disabled={pairingBusy}>
                    {pairingBusy ? "Generating..." : "Generate Reception Setup Code"}
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 10 }}>
                  On the Reception computer, choose Connect to Hospital Server, then enter one of the addresses above
                  together with this one-time code. The code works once and expires after 10 minutes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
