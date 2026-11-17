import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { getLanServerEnabled, setLanServerEnabled, getLanServerPort, setLanServerPort, getOrCreateLanServerSetupToken, getDeviceCredentials, } from './database.cjs';
import { ensurePaired } from './cloudBackup.js';
let child = null;
let currentPort = null;
let lastError = null;
let stderrTail = '';
// Set true only by stopLanServer() itself, so the child's 'exit' handler
// can tell "we asked for this" apart from "it crashed on its own" — the
// latter is reported as an error, the former isn't.
let stopRequested = false;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function getServerEntryPath() {
    if (app.isPackaged) {
        // Bundled via electron-builder's extraResources — see package.json.
        // Outside app.asar entirely (extraResources always is), so the native
        // better-sqlite3 addon inside server/node_modules needs no asarUnpack
        // handling of its own.
        return path.join(process.resourcesPath, 'server', 'dist', 'index.js');
    }
    // Dev: dist-electron/lanServer.js -> ../server/dist/index.js. Requires
    // `npm run build` to have been run inside server/ at least once — the
    // same prerequisite a standalone `npm start` there already has.
    return path.join(__dirname, '..', 'server', 'dist', 'index.js');
}
function getServerDataDir() {
    // Under this app's own userData — already known-writable, already
    // survives an app update/reinstall (unlike the install directory
    // itself), and keeps LAN-server data alongside this Admin install's own
    // opd.db rather than inventing a new location convention.
    return path.join(app.getPath('userData'), 'lan-server-data');
}
// Real, non-loopback IPv4 addresses only — a person picks from these to
// tell Reception where this PC is. Filters out common virtual/VPN adapter
// names on a best-effort basis; if that heuristic ever hides the right
// one, every genuine address is still in the list, just not marked first.
const VIRTUAL_ADAPTER_NAME_PATTERN = /virtualbox|vmware|hyper-v|vethernet|loopback|tailscale|zerotier|wsl/i;
export function getLanAddresses() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const [name, addrs] of Object.entries(interfaces)) {
        for (const addr of addrs ?? []) {
            if (addr.family === 'IPv4' && !addr.internal) {
                candidates.push({ name, address: addr.address, likelyVirtual: VIRTUAL_ADAPTER_NAME_PATTERN.test(name) });
            }
        }
    }
    const real = candidates.filter((c) => !c.likelyVirtual);
    const recommended = (real[0] ?? candidates[0])?.address ?? null;
    return { recommended, all: candidates.map((c) => c.address) };
}
// Takes the spawned process directly rather than reading the module-level
// `child` variable — the child's own 'exit' handler (registered by the
// caller before this runs) nulls out `child` as soon as the process exits,
// which would make an exitCode check against `child` never fire and this
// function would run the full timeout for what's actually a fast, clearly
// diagnosable crash (confirmed via testing: an ABI-mismatched native
// module load failure was reported as a generic "did not respond within
// the expected time" instead of the real error before this fix).
async function waitForHealthy(proc, port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (proc.exitCode !== null) {
            throw new Error(stderrTail || `Server process exited before starting up (code ${proc.exitCode}).`);
        }
        try {
            // A per-attempt timeout matters here, not just the overall deadline:
            // something already holding the port that accepts a TCP connection
            // but never answers (confirmed via testing, using a bare listener
            // with no request handler) would otherwise hang this single fetch
            // indefinitely, blocking the deadline check above from ever running
            // again.
            const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
            if (res.ok)
                return;
        }
        catch {
            // not up yet — keep polling
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('Server did not respond within the expected time.');
}
export async function startLanServer() {
    if (child && child.exitCode === null) {
        return getLanServerStatus();
    }
    const entryPath = getServerEntryPath();
    if (!fs.existsSync(entryPath)) {
        lastError = app.isPackaged
            ? 'LAN sync server files are missing from this installation.'
            : `Server build not found at ${entryPath} — run "npm run build" inside server/ first.`;
        return getLanServerStatus();
    }
    const port = getLanServerPort();
    const setupToken = getOrCreateLanServerSetupToken();
    const dataDir = getServerDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    stopRequested = false;
    lastError = null;
    stderrTail = '';
    child = spawn(process.execPath, [entryPath], {
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            PORT: String(port),
            HOST: '0.0.0.0',
            DEVICE_SETUP_TOKEN: setupToken,
            DB_PATH: path.join(dataDir, 'server.db'),
            STORAGE_DIR: path.join(dataDir, 'storage'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    const spawnedChild = child;
    spawnedChild.stdout?.on('data', (chunk) => console.log('[LanServer]', chunk.toString().trim()));
    spawnedChild.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        stderrTail = text.trim();
        console.error('[LanServer]', text.trim());
    });
    spawnedChild.on('exit', (code) => {
        if (!stopRequested && code !== 0) {
            lastError = stderrTail || `Server stopped unexpectedly (exit code ${code}).`;
            console.error('[LanServer] Unexpected exit:', lastError);
        }
        child = null;
        currentPort = null;
    });
    try {
        await waitForHealthy(spawnedChild, port, 8000);
    }
    catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        try {
            spawnedChild.kill();
        }
        catch {
            // already gone
        }
        child = null;
        return getLanServerStatus();
    }
    currentPort = port;
    // Self-pair this Admin install against the server it just started, if
    // not already paired. Reuses ensurePaired() unchanged — pointing it at
    // this local server for the duration of this call is exactly what makes
    // Admin's own sync subsequently talk to it too (see main.ts's startup
    // ordering: this runs before the startup sync cycle).
    process.env['CLOUD_API_URL'] = `http://127.0.0.1:${port}`;
    process.env['CLOUD_DEVICE_SETUP_TOKEN'] = setupToken;
    try {
        await ensurePaired();
    }
    catch (error) {
        lastError = `Server is running, but this Admin app could not pair with it: ${error instanceof Error ? error.message : String(error)}`;
    }
    setLanServerEnabled(true);
    return getLanServerStatus();
}
// Kills the child process only — does not touch the persisted "enabled"
// preference. Used both by stopLanServer() (which does update it — an
// explicit Stop is a real preference change) and by the app-quit handler
// in main.ts (which must not: this app closing should not be
// indistinguishable from the admin clicking Stop, or the server would
// never resume on the next launch).
async function killLanServerProcess() {
    if (!child)
        return;
    stopRequested = true;
    const toKill = child;
    await new Promise((resolve) => {
        toKill.once('exit', () => resolve());
        toKill.kill();
        // Simple, hospital-appropriate safety net — a plain HTTP server with
        // only short-lived requests has nothing meaningful to drain, so a hard
        // kill after a short grace period is fine, not a compromise.
        setTimeout(() => {
            try {
                toKill.kill('SIGKILL');
            }
            catch {
                // already gone
            }
            resolve();
        }, 3000);
    });
    child = null;
    currentPort = null;
}
// The UI's "Stop Server" action — an explicit preference change, so this
// also persists enabled:false (the server should stay off on the next
// launch too, until the admin turns it back on).
export async function stopLanServer() {
    await killLanServerProcess();
    setLanServerEnabled(false);
    return getLanServerStatus();
}
// Only for the app-quit path — stops the process without persisting
// enabled:false, so a plain app close (not an explicit Stop) still resumes
// the server automatically on the next launch.
export async function killLanServerForShutdown() {
    await killLanServerProcess();
}
export async function restartLanServer() {
    await killLanServerProcess();
    return startLanServer();
}
export function getLanServerStatus() {
    const { all } = getLanAddresses();
    return {
        enabled: getLanServerEnabled(),
        running: !!child && child.exitCode === null,
        port: currentPort,
        addresses: all,
        lastError,
    };
}
// Called once at app startup (see main.ts) — resumes the server
// automatically if it was left enabled last time, before the startup sync
// cycle runs.
export async function autoStartLanServerIfEnabled() {
    if (getLanServerEnabled()) {
        await startLanServer();
    }
}
export async function generatePairingCode() {
    if (!child || currentPort === null) {
        throw new Error('LAN sync server is not running.');
    }
    const credentials = getDeviceCredentials();
    if (!credentials) {
        throw new Error('This Admin app has not paired with its own server yet.');
    }
    const response = await fetch(`http://127.0.0.1:${currentPort}/auth/pairing-code`, {
        method: 'POST',
        headers: {
            'X-Device-Id': credentials.deviceId,
            Authorization: `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: '{}',
    });
    if (!response.ok) {
        throw new Error(`Could not generate a pairing code (${response.status}).`);
    }
    return (await response.json());
}
export function setLanServerPortConfig(port) {
    setLanServerPort(port);
}
