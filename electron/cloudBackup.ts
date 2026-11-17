import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { getDeviceCredentials, setDeviceCredentials, getPairedApiUrl, clearDeviceCredentials } from './database.cjs';
import {
  requireApiBaseUrl,
  getHospitalId,
  getDeviceSetupToken,
  scrubSetupTokenFromConfig,
  describeConnectionFailure,
  setConfigValue,
} from './productionConfig.js';

// Base URL, hospital ID, and setup token are never hardcoded here — see
// productionConfig.ts for exactly how each is resolved (env var in
// development, production.env in a packaged build, never a guessed
// fallback once packaged). Deliberately not a Settings UI field either —
// a hospital admin is never asked to type a server address or paste an
// API key into a form (see the architecture report's Security Model
// section).

export interface CloudBackupStatus {
  configured: boolean;
  lastUploadAt: string | null;
  lastUploadFile: string | null;
  lastError: string | null;
}

export interface CloudBackupInfo {
  filename: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}

let lastUploadAt: string | null = null;
let lastUploadFile: string | null = null;
let lastError: string | null = null;

let inFlightPairing: Promise<{ deviceId: string; apiKey: string }> | null = null;

// Registers this install with the server on first use and remembers the
// credentials thereafter — there is no separate "Pair Device" step in the
// UI for this release; any machine running this app is already trusted
// the same way it's already trusted to hold the local database itself.
// Exported so electron/sync.ts can reuse the exact same device identity
// for its own requests — one device credential per install, shared by
// both the backup and sync APIs (see the architecture report, Section 11).
//
// The in-flight guard matters in practice, not just in theory: at startup,
// the automatic cloud-backup upload and the automatic sync cycle both call
// this within the same tick, before either has had a chance to persist
// credentials — without it, both would see "not yet paired" and each
// register a separate device for the same physical machine (confirmed via
// testing). Concurrent callers now join the one real pairing attempt and
// all receive the same result, exactly like sync.ts's runSyncCycle().
//
// "Already have credentials" is not the same question as "have credentials
// for the server I'm about to talk to" — a device ID/API key pair only
// means something to the one server that issued it. Confirmed via testing:
// an Admin device that had old credentials from a previous dev server
// reused them against a freshly started LAN server, which had never heard
// of that device, and every authenticated call 401'd. getPairedApiUrl()
// records which address each credential set was actually issued by, so a
// changed address (a different LAN port, a new hospital server, or simply
// credentials that predate this check) is treated as unpaired rather than
// silently trusted.
export async function ensurePaired(): Promise<{ deviceId: string; apiKey: string }> {
  const apiBaseUrl = requireApiBaseUrl();
  const existing = getDeviceCredentials();
  if (existing && getPairedApiUrl() === apiBaseUrl) {
    return existing;
  }

  if (existing) {
    // Belongs to a different server than the one we're about to use —
    // discard rather than send credentials that server has never
    // registered. Only the three cloud_* pairing keys are touched; no
    // patient data, sync state, or backup settings are affected.
    clearDeviceCredentials();
  }

  if (inFlightPairing) return inFlightPairing;

  inFlightPairing = (async () => {
    try {
      const setupToken = getDeviceSetupToken();
      if (!setupToken) {
        throw new Error('Cloud backup is not configured on this installation.');
      }

      const response = await fetch(`${apiBaseUrl}/auth/device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken,
          hospitalId: getHospitalId(),
          label: os.hostname(),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Device pairing failed (${response.status}): ${body || response.statusText}`);
      }

      const { deviceId, apiKey } = (await response.json()) as { deviceId: string; apiKey: string };
      setDeviceCredentials(deviceId, apiKey, apiBaseUrl);
      // The setup token has done its one job for this device — see
      // scrubSetupTokenFromConfig()'s own comment for why it's removed
      // from disk now rather than left sitting there indefinitely.
      scrubSetupTokenFromConfig();
      return { deviceId, apiKey };
    } finally {
      inFlightPairing = null;
    }
  })();

  return inFlightPairing;
}

function authHeaders(deviceId: string, apiKey: string): Record<string, string> {
  return { 'X-Device-Id': deviceId, Authorization: `Bearer ${apiKey}` };
}

// The Reception-side "Connect to Hospital Server" flow — pairs using a
// short-lived pairing code an Admin generated (see electron/lanServer.ts's
// generatePairingCode()), never the permanent setup token. On success,
// remembers the address for future launches (production.env, same file
// getApiBaseUrl() already reads) and applies it immediately to this
// running session, so sync works right away without an app restart.
export async function connectToHospitalServer(
  rawAddress: string,
  pairingCode: string
): Promise<{ success: boolean; error?: string }> {
  const address = /^https?:\/\//i.test(rawAddress.trim()) ? rawAddress.trim() : `http://${rawAddress.trim()}`;
  const normalizedAddress = address.replace(/\/+$/, '');

  try {
    const response = await fetch(`${normalizedAddress}/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode: pairingCode.trim() }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let message = `Connection failed (${response.status})`;
      try {
        const parsed = JSON.parse(body) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        // non-JSON error body — keep the generic message above
      }
      return { success: false, error: message };
    }

    const { deviceId, apiKey } = (await response.json()) as { deviceId: string; apiKey: string };
    setDeviceCredentials(deviceId, apiKey, normalizedAddress);

    setConfigValue('CLOUD_API_URL', normalizedAddress);
    process.env['CLOUD_API_URL'] = normalizedAddress;

    return { success: true };
  } catch (error) {
    return { success: false, error: describeConnectionFailure(error, 'Data sync') };
  }
}

// Uploads one backup file. Only ever called with a path that has already
// passed the local PRAGMA integrity_check and already been atomically
// renamed into its final place by createBackup() — never an in-progress
// snapshot. Purely additive and best-effort: any failure here is
// recorded for the status UI but never affects local backup success or
// app function, matching "registration keeps working fully offline."
export async function uploadBackupFile(filePath: string): Promise<{ success: boolean; error?: string; status?: string }> {
  const filename = path.basename(filePath);
  try {
    const { deviceId, apiKey } = await ensurePaired();
    const apiBaseUrl = requireApiBaseUrl();
    const data = fs.readFileSync(filePath);
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    const response = await fetch(`${apiBaseUrl}/backup/upload`, {
      method: 'POST',
      headers: {
        ...authHeaders(deviceId, apiKey),
        'Content-Type': 'application/octet-stream',
        'X-Filename': filename,
        'X-Sha256': sha256,
      },
      body: data,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Upload rejected (${response.status}): ${body || response.statusText}`);
    }

    const result = (await response.json()) as { status: string };
    lastUploadAt = new Date().toISOString();
    lastUploadFile = filename;
    lastError = null;
    console.log(
      `[CloudBackup] ${result.status === 'already-current' ? 'Already up to date in cloud' : 'Uploaded'}: ${filename}`
    );
    return { success: true, status: result.status };
  } catch (error) {
    // Console keeps the raw/technical message (useful for debugging); the
    // stored/returned message — what the Settings UI actually shows — is
    // translated to something a hospital user can make sense of when the
    // failure is simply "no server reachable" (see describeConnectionFailure).
    console.error(`[CloudBackup] Upload failed for ${filename}:`, error instanceof Error ? error.message : error);
    const message = describeConnectionFailure(error, 'Cloud backup');
    lastError = message;
    return { success: false, error: message };
  }
}

export async function listCloudBackups(): Promise<CloudBackupInfo[]> {
  const { deviceId, apiKey } = await ensurePaired();
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/backup/list`, { headers: authHeaders(deviceId, apiKey) });
  if (!response.ok) {
    throw new Error(`Could not list cloud backups (${response.status})`);
  }
  return (await response.json()) as CloudBackupInfo[];
}

// Downloads one cloud backup to a local path — used only by the restore
// flow (main.ts), never automatically, and never overwrites opd.db
// directly (the caller writes it to a temp path first).
export async function downloadCloudBackup(filename: string, destPath: string): Promise<void> {
  const { deviceId, apiKey } = await ensurePaired();
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/backup/download/${encodeURIComponent(filename)}`, {
    headers: authHeaders(deviceId, apiKey),
  });
  if (!response.ok) {
    throw new Error(`Could not download ${filename} (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

// Cached/last-known state only — deliberately does not make a live network
// call, so reading status for the Settings screen is always instant even
// if the server is unreachable. A live check happens naturally whenever
// an upload or list call is actually made (manual or automatic).
export function getCloudBackupStatus(): CloudBackupStatus {
  let configured = false;
  try {
    configured = !!getDeviceCredentials();
  } catch {
    // not initialized — report as not configured rather than throwing
  }
  return { configured, lastUploadAt, lastUploadFile, lastError };
}
