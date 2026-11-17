import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
// Shared by cloudBackup.ts and sync.ts — both talk to the same server with
// the same device identity, so both need the same three values and the
// same "never silently use a dev default in a real install" rule.
//
// Values are read from process.env on every call, not captured once at
// module load — main.ts loads production.env (see getProductionConfigPath
// below) after these modules are already imported, so a one-time capture
// at import time would permanently miss it. Reading fresh each call also
// means nothing here depends on import order.
const PRODUCTION_CONFIG_FILENAME = 'production.env';
// A fixed, documented path outside the repo and outside the packaged
// installer entirely — see the deployment plan for the exact deployment
// step that places this file on each hospital PC. Never read at build
// time, never bundled: this path is only ever consulted at runtime, on
// the machine the app is actually running on.
export function getProductionConfigPath() {
    return path.join(app.getPath('userData'), PRODUCTION_CONFIG_FILENAME);
}
// Non-secret — safe to keep a hardcoded fallback even in a packaged build.
// There is exactly one hospital in this deployment; getting this "wrong"
// in production would mean the config file simply wasn't provisioned yet,
// which getApiBaseUrl()/getDeviceSetupToken() below already catch and
// report clearly.
export function getHospitalId() {
    return process.env['CLOUD_HOSPITAL_ID'] || 'unani-hospital-bhopal';
}
// Returns null (never a guessed value) when running packaged with no
// production.env present — a packaged build has no local dev server to
// fall back to, so silently trying http://localhost:4000 on a real
// hospital PC would just fail confusingly. Development (`npm run dev`)
// keeps its exact existing behavior: the localhost default always applies.
export function getApiBaseUrl() {
    const configured = process.env['CLOUD_API_URL'];
    if (configured)
        return configured;
    if (app.isPackaged)
        return null;
    return 'http://localhost:4000';
}
// Same reasoning as getApiBaseUrl() — never a guessed/default secret in a
// packaged build.
export function getDeviceSetupToken() {
    const configured = process.env['CLOUD_DEVICE_SETUP_TOKEN'];
    if (configured)
        return configured;
    if (app.isPackaged)
        return null;
    return 'local-dev-setup-token';
}
// Throws a clear, specific error instead of ever constructing a URL like
// "null/backup/upload" — every call site that's about to make a real
// network request calls this first.
export function requireApiBaseUrl() {
    const url = getApiBaseUrl();
    if (!url) {
        throw new Error('Cloud backup is not configured on this installation.');
    }
    return url;
}
// Node's fetch() throws this exact, generic message when it cannot reach a
// server at all (connection refused, DNS failure, etc.) — the real cause
// sits on error.cause, which is useful in a console log but meaningless to
// a hospital user. A clean non-2xx HTTP response never reaches this check:
// every such case is already thrown with its own specific, descriptive
// message at its call site (e.g. "Upload rejected (401): ..."), so this
// only ever rewrites the one generic case. This is what lets a prototype
// or dev environment with no server running read as "not available yet"
// rather than "broken" — the underlying request, retry, and scheduling
// behavior is completely unchanged either way.
export function describeConnectionFailure(error, feature) {
    if (error instanceof Error && error.message === 'fetch failed') {
        return feature === 'Cloud backup'
            ? "Cloud backup server is not reachable right now — this is expected if it hasn't been set up for this installation yet. Local backups are unaffected."
            : "Data sync server is not reachable right now — this is expected if it hasn't been set up for this installation yet. Local data is unaffected.";
    }
    return error instanceof Error ? error.message : String(error);
}
// Best-effort only, and never allowed to fail whatever triggered it — see
// the call site in cloudBackup.ts's ensurePaired() for why this exists:
// the setup token is a shared master secret for the whole hospital's
// device fleet, and it has no further purpose once THIS device has its
// own long-lived API key. Removes just the CLOUD_DEVICE_SETUP_TOKEN line,
// leaving CLOUD_API_URL/CLOUD_HOSPITAL_ID in place since every future
// request still needs them.
export function scrubSetupTokenFromConfig() {
    try {
        const configPath = getProductionConfigPath();
        if (!fs.existsSync(configPath))
            return;
        const lines = fs.readFileSync(configPath, 'utf-8').split(/\r?\n/);
        const scrubbed = lines.filter((line) => !/^\s*CLOUD_DEVICE_SETUP_TOKEN\s*=/.test(line));
        if (scrubbed.length !== lines.length) {
            fs.writeFileSync(configPath, scrubbed.join('\n'));
            console.log('[ProductionConfig] Setup token cleared from production.env after successful device pairing.');
        }
    }
    catch (error) {
        console.error('[ProductionConfig] Could not scrub setup token from config (non-fatal):', error instanceof Error ? error.message : String(error));
    }
}
// Used by the in-app "Connect to Hospital Server" flow (electron/
// cloudBackup.ts's connectToHospitalServer()) so a Reception install
// remembers its chosen server address across restarts — the same
// production.env file this app already reads CLOUD_API_URL from, updated
// in place rather than requiring anyone to open and edit it by hand.
// Read-modify-write on the whole file, same technique as
// scrubSetupTokenFromConfig() above; creates the file if it doesn't exist
// yet (a fresh install has none).
export function setConfigValue(key, value) {
    const configPath = getProductionConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    const existingLines = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8').split(/\r?\n/) : [];
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    const withoutKey = existingLines.filter((line) => !pattern.test(line));
    withoutKey.push(`${key}=${value}`);
    fs.writeFileSync(configPath, withoutKey.filter((line) => line.length > 0).join('\n') + '\n');
}
