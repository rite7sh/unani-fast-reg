import { getUnsyncedPatients, getSyncPendingCount, markPatientsSynced, markPatientsSyncFailed, getSyncCursor, setSyncCursor, upsertSyncedPatientFromServer, recordSyncPushResult, recordSyncPullResult, } from './database.cjs';
import { ensurePaired } from './cloudBackup.js';
import { requireApiBaseUrl, describeConnectionFailure } from './productionConfig.js';
// Same server, same device identity as cloud backup (electron/cloudBackup.ts)
// — deliberately reusing productionConfig.ts/ensurePaired() rather than a
// second URL/credential pair, since this is structured operational data
// going to the same already-paired install, not a different system.
// Bounds a single push request's size — a device's very first sync after
// this feature ships may have years of pre-existing historical records all
// marked unsynced at once; this keeps that backlog moving in steady,
// resumable chunks instead of one huge request.
const PUSH_CHUNK_SIZE = 200;
const MAX_PUSH_BATCHES = 100;
const MAX_PULL_PAGES = 50;
function authHeaders(deviceId, apiKey) {
    return { 'X-Device-Id': deviceId, Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}
// Diagnosis/diagnosis_other are deliberately excluded — dead legacy fields
// nothing in the Admin app reads anymore (see the Patient interface
// comment in database.ts). Keeping them out of every sync payload is the
// "don't unnecessarily synchronize" instruction applied to columns, not
// just whole tables.
function toSyncPayload(p) {
    return {
        opd_no: p.opd_no,
        registration_date: p.registration_date,
        registration_time: p.registration_time ?? null,
        patient_name: p.patient_name,
        age_years: p.age_years,
        age_months: p.age_months,
        gender: p.gender,
        address: p.address,
        aadhaar_number: p.aadhaar_number ?? null,
        mobile_number: p.mobile_number ?? null,
        department: p.department ?? null,
        consultant: p.consultant,
        employee_id: p.employee_id,
        is_deleted: p.is_deleted ?? 0,
        created_at: p.created_at,
        updated_at: p.updated_at,
    };
}
// Pushes every locally pending change (synced = 0) to the central server in
// bounded batches. A row is only marked synced once the server has actually
// acknowledged storing it (see markPatientsSynced() below) — never
// optimistically beforehand — so a network drop mid-batch always leaves the
// unconfirmed rows exactly where the next push (scheduled or manual) will
// find and retry them, with no risk of silently losing or duplicating a
// pending change.
export async function pushPendingPatients() {
    let pushed = 0;
    let failed = 0;
    try {
        // Nothing queued — skip the network round trip entirely rather than
        // attempting device pairing just to send an empty batch.
        if (getSyncPendingCount() === 0) {
            recordSyncPushResult(true, null);
            return { success: true, pushed: 0, failed: 0 };
        }
        const { deviceId, apiKey } = await ensurePaired();
        const apiBaseUrl = requireApiBaseUrl();
        for (let batchNum = 0; batchNum < MAX_PUSH_BATCHES; batchNum++) {
            const batch = getUnsyncedPatients(PUSH_CHUNK_SIZE);
            if (batch.length === 0)
                break;
            const response = await fetch(`${apiBaseUrl}/sync/push`, {
                method: 'POST',
                headers: authHeaders(deviceId, apiKey),
                body: JSON.stringify({ patients: batch.map(toSyncPayload) }),
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`Sync push rejected (${response.status}): ${body || response.statusText}`);
            }
            const result = (await response.json());
            const acceptedSet = new Set(result.accepted);
            const rejectedByOpdNo = new Map(result.rejected.map((r) => [r.opd_no, r.error]));
            const acceptedIds = batch.filter((p) => acceptedSet.has(p.opd_no)).map((p) => p.id);
            markPatientsSynced(acceptedIds);
            pushed += acceptedIds.length;
            for (const p of batch) {
                const err = rejectedByOpdNo.get(p.opd_no);
                if (err) {
                    markPatientsSyncFailed([p.id], err);
                    failed += 1;
                }
            }
            // Nothing in this batch was confirmed (every row rejected, or an
            // unexpected empty response) — stop instead of re-fetching the exact
            // same unsynced rows forever.
            if (acceptedIds.length === 0)
                break;
        }
        recordSyncPushResult(true, null);
        return { success: true, pushed, failed };
    }
    catch (error) {
        // Same reasoning as cloudBackup.ts's uploadBackupFile — a plain "no
        // server reachable" failure reads as expected/graceful in a prototype
        // or dev environment, not as something broken.
        const message = describeConnectionFailure(error, 'Data sync');
        recordSyncPushResult(false, message);
        return { success: false, pushed, failed, error: message };
    }
}
// Pulls every centrally-stored patient change since this device's last pull
// (a persisted synced_at cursor) and applies each one locally. Paginates
// until a page comes back empty, so one call always catches this device
// fully up regardless of how large the backlog is — see
// upsertSyncedPatientFromServer() in database.ts for why a row with an
// unconfirmed local edit is deliberately never overwritten here.
export async function pullLatestPatients() {
    let totalPulled = 0;
    try {
        const { deviceId, apiKey } = await ensurePaired();
        const apiBaseUrl = requireApiBaseUrl();
        for (let page = 0; page < MAX_PULL_PAGES; page++) {
            const cursor = getSyncCursor();
            const url = new URL(`${apiBaseUrl}/sync/pull`);
            if (cursor)
                url.searchParams.set('since', cursor);
            const response = await fetch(url, { headers: authHeaders(deviceId, apiKey) });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`Sync pull failed (${response.status}): ${body || response.statusText}`);
            }
            const result = (await response.json());
            for (const row of result.patients) {
                upsertSyncedPatientFromServer(row);
            }
            totalPulled += result.patients.length;
            if (result.cursor) {
                setSyncCursor(result.cursor);
            }
            if (result.patients.length === 0)
                break;
        }
        recordSyncPullResult(true, totalPulled, null);
        return { success: true, pulled: totalPulled };
    }
    catch (error) {
        const message = describeConnectionFailure(error, 'Data sync');
        recordSyncPullResult(false, totalPulled > 0 ? totalPulled : null, message);
        return { success: false, pulled: totalPulled, error: message };
    }
}
let inFlightCycle = null;
// The single entry point both the manual "Sync Now" action and the 2-hour
// scheduler call. Push always runs before pull, so this device's own
// just-made edits reach the server before its own pull can otherwise read
// back (and, per the skip rule in upsertSyncedPatientFromServer(), safely
// ignore) a stale copy of the same row.
//
// A call that arrives while a cycle is already running does not start a
// second, overlapping attempt — it joins the same in-flight promise and
// receives its real result once that cycle finishes, rather than an
// immediate "try again" rejection. This matters in practice: a caller that
// reacts to its own sync completing (e.g. the Admin dashboard loading
// analytics right after its startup sync) must see the actual outcome of
// whichever cycle actually ran, not a synthetic failure that leaves it
// looking at data from before either cycle started.
export function runSyncCycle() {
    if (inFlightCycle) {
        return inFlightCycle;
    }
    inFlightCycle = (async () => {
        try {
            const push = await pushPendingPatients();
            const pull = await pullLatestPatients();
            return { success: push.success && pull.success, push, pull };
        }
        finally {
            inFlightCycle = null;
        }
    })();
    return inFlightCycle;
}
