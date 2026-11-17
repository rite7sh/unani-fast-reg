import { useEffect, useState } from "react";

type SyncState = "Ready to sync" | "Syncing..." | "Synced" | "Sync failed";

// Re-enabled for the LAN prototype demo — loadSyncStatus()/syncNow() below
// and the sync engine itself work regardless of this flag; it only
// controls whether the widget renders anything.
const SHOW_SYNC_UI = true;

// Lets a screen elsewhere in the tree (Registration, after saving a new
// patient) ask every mounted SyncStatusWidget to refresh immediately,
// without prop-drilling a callback through AppHeader — sync state is
// global to the device, so any screen's action that changes the pending
// count should be reflected right away, not just on this widget's own
// next mount.
const SYNC_STATUS_CHANGED_EVENT = "sync-status-changed";
export function notifySyncStatusChanged() {
  window.dispatchEvent(new Event(SYNC_STATUS_CHANGED_EVENT));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Shared across every Employee screen (Dashboard, Registration, Patient
// History) via AppHeader's `right` slot — sync state belongs to the device,
// not to whichever screen happens to be open, so it shows the same status
// and offers the same controls everywhere rather than only on Registration.
// Self-contained: reads/writes window.electron.sync directly, so a screen
// only needs to render <SyncStatusWidget /> with no props.
export default function SyncStatusWidget() {
  const [sync, setSync] = useState<SyncState>("Ready to sync");
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectAddress, setConnectAddress] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectNotice, setConnectNotice] = useState("");

  // Reflects real push state (Backup and Sync are intentionally separate —
  // this never touches a backup snapshot): "Ready to sync" while there are
  // local changes the server hasn't confirmed yet, "Synced" once nothing is
  // pending, "Sync failed" after the last attempt errored.
  function loadSyncStatus() {
    window.electron.sync
      .getStatus()
      .then((status) => {
        setSyncStatus(status);
        if (status.lastPushError) setSync("Sync failed");
        else if (status.pendingPushCount > 0) setSync("Ready to sync");
        else setSync("Synced");
      })
      .catch((err) => console.error("[SyncStatusWidget] getStatus failed:", err));
  }

  useEffect(() => {
    loadSyncStatus();
    window.addEventListener(SYNC_STATUS_CHANGED_EVENT, loadSyncStatus);
    return () => window.removeEventListener(SYNC_STATUS_CHANGED_EVENT, loadSyncStatus);
  }, []);

  async function syncNow() {
    setSyncBusy(true);
    setSync("Syncing...");
    try {
      const result = await window.electron.sync.syncNow();
      setSync(result.success ? "Synced" : "Sync failed");
    } catch (error) {
      console.error("[SyncStatusWidget] syncNow failed:", error);
      setSync("Sync failed");
    } finally {
      setSyncBusy(false);
      loadSyncStatus();
    }
  }

  // Reception's own pairing flow — connects using a short-lived setup code
  // an Admin generated on their Settings screen, never the permanent setup
  // token. Once paired, the chosen address is remembered on this computer,
  // so this modal is only needed again if reconnecting to a different
  // server.
  async function connectToServer() {
    setConnectBusy(true);
    setConnectError("");
    setConnectNotice("");
    try {
      const result = await window.electron.sync.connectToHospitalServer(connectAddress.trim(), connectCode.trim());
      if (result.success) {
        setConnectNotice("Connected to the hospital server.");
        setConnectCode("");
        loadSyncStatus();
        setTimeout(() => setShowConnectModal(false), 1200);
      } else {
        setConnectError(result.error || "Could not connect. Check the address and code.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnectError(`Could not connect: ${message}`);
    } finally {
      setConnectBusy(false);
    }
  }

  if (!SHOW_SYNC_UI) return null;

  return (
    <>
      <span
        className={`sync sync-${sync.replace(/[^a-z]/gi, "").toLowerCase()}`}
        title={syncStatus?.lastPushError ?? undefined}
      >
        <span className="sdot" aria-hidden="true" />
        {sync}
      </span>
      <span className={syncStatus?.lastPushError ? "meta small sync-error" : "meta small"}>
        {syncStatus?.lastPushError
          ? `Sync error: ${syncStatus.lastPushError}`
          : `Last synced: ${syncStatus?.lastPushAt ? formatDateTime(syncStatus.lastPushAt) : "Never"}`}
      </span>
      <button className="btn-ghost" onClick={syncNow} disabled={syncBusy}>
        {syncBusy ? "Syncing..." : "Sync Now"}
      </button>
      <button className="btn-ghost" onClick={() => setShowConnectModal(true)}>
        Connect to Hospital Server
      </button>

      {showConnectModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => !connectBusy && setShowConnectModal(false)}
        >
          <div className="panel" style={{ width: 380, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Connect to Hospital Server</h2>
            <p className="hint">
              Enter this computer's server address and the one-time setup code shown on the Admin computer's
              Settings screen, under Data Sync.
            </p>

            {connectNotice && <p className="succ-note">{connectNotice}</p>}
            {connectError && <p className="err">{connectError}</p>}

            <label className="lbl" htmlFor="connect-address">
              Server Address
            </label>
            <input
              id="connect-address"
              className="inp"
              placeholder="e.g. 192.168.1.20:4000"
              value={connectAddress}
              onChange={(e) => setConnectAddress(e.target.value)}
              disabled={connectBusy}
            />

            <label className="lbl" htmlFor="connect-code" style={{ marginTop: 12 }}>
              Setup Code
            </label>
            <input
              id="connect-code"
              className="inp"
              placeholder="XXXX-XXXX"
              value={connectCode}
              onChange={(e) => setConnectCode(e.target.value)}
              disabled={connectBusy}
            />

            <div className="actions bar" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowConnectModal(false)} disabled={connectBusy}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={connectToServer}
                disabled={connectBusy || !connectAddress.trim() || !connectCode.trim()}
              >
                {connectBusy ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
