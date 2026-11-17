import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase, registerPatient, checkDuplicate, searchPatients, getPatient, updatePatient, getConsultants, getDepartments, getReturningPatientAddress, getDashboardStats, previewNextOpdNumber, createBackup, createManualBackup, ensureTodayBackup, getBackupStatus, getBackupCustomLocation, setBackupCustomLocation, validateBackupLocation, getDefaultBackupLocation, getLatestBackupFilePath, getLocalBackupFilePath, replaceLiveDatabaseFile, verifyBackup, hasAdminPassword, setAdminPassword, verifyAdminPassword, changeAdminPassword, recoverAdminPassword, listConsultantsAdmin, addConsultant, updateConsultantName, setConsultantActive, listDepartmentsAdmin, addDepartment, updateDepartmentName, setDepartmentActive, getConsultantsForDepartment, getDepartmentConsultantIds, setDepartmentConsultants, getAdminAnalytics, getPatientAdmin, restorePatient, exportPatientsCsv, exportConsultantsCsv, exportPatientsListCsv, getReportPreviewRows, listBackups, getSyncStatus, } from './database.cjs';
import { uploadBackupFile, listCloudBackups, downloadCloudBackup, getCloudBackupStatus, connectToHospitalServer } from './cloudBackup.js';
import { runSyncCycle } from './sync.js';
import { getProductionConfigPath } from './productionConfig.js';
import { startLanServer, stopLanServer, restartLanServer, getLanServerStatus, getLanAddresses, generatePairingCode, autoStartLanServerIfEnabled, setLanServerPortConfig, killLanServerForShutdown, } from './lanServer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Loads CLOUD_API_URL / CLOUD_HOSPITAL_ID / CLOUD_DEVICE_SETUP_TOKEN from a
// file placed on this machine during deployment — never part of this repo
// or the packaged installer (see productionConfig.ts). Must run before
// anything in cloudBackup.ts/sync.ts can execute; both read process.env
// fresh on every call rather than capturing it at import time, so this
// only needs to happen before app.on('ready') fires, not before those
// modules are imported above. A missing file (every local dev machine) is
// not an error — dotenv leaves process.env untouched and the existing
// localhost/dev-token defaults apply exactly as before.
dotenv.config({ path: getProductionConfigPath() });
let mainWindow = null;
async function findAvailableDevServer() {
    const ports = [9999, 10000, 10001, 10002, 10003, 10004, 10005];
    for (const port of ports) {
        const url = `http://localhost:${port}`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 500);
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok || response.status === 404) {
                console.log(`[Electron] Found Vite dev server on port ${port}`);
                return url;
            }
        }
        catch (e) {
            // Port not available, try next
        }
    }
    console.warn('[Electron] Could not find Vite server, defaulting to 9999');
    return 'http://localhost:9999';
}
function getDevServerURL() {
    return findAvailableDevServer();
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Electron] did-fail-load: code=${errorCode}, desc="${errorDescription}", url="${validatedURL}"`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Electron] did-finish-load - page loaded successfully');
    });
    mainWindow.webContents.on('console-message', (level, message, line, sourceId) => {
        console.log(`[Renderer L${line}] ${message}`);
    });
    // Packaged builds never attempt dev-server detection — a customer
    // machine has no Vite dev server, and app.isPackaged is the reliable
    // signal for that (unlike findAvailableDevServer(), which always
    // resolves to a URL string even when nothing is listening, so its own
    // failure path can never be relied on to distinguish dev from
    // production). Development keeps its existing dev-server-first,
    // loadFile-fallback behavior unchanged.
    if (app.isPackaged) {
        const indexPath = path.join(__dirname, '../dist/index.html');
        console.log(`[Electron] Packaged build — loading production from: ${indexPath}`);
        mainWindow.loadFile(indexPath);
    }
    else {
        console.log('[Electron] Attempting to connect to dev server...');
        getDevServerURL().then(devURL => {
            console.log(`[Electron] Found dev server at: ${devURL}`);
            mainWindow?.loadURL(devURL);
        }).catch(err => {
            console.log('[Electron] Dev server not found, loading from production build...');
            const indexPath = path.join(__dirname, '../dist/index.html');
            console.log(`[Electron] Loading production from: ${indexPath}`);
            mainWindow?.loadFile(indexPath);
        });
    }
    // DevTools only in development — a customer build should never open it
    // automatically. Electron security settings above (contextIsolation,
    // nodeIntegration, sandbox, webPreferences) are unrelated and untouched.
    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function withTimeout(promise, ms, timeoutMessage) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), ms)),
    ]);
}
// Best-effort upload of one specific file. Never throws — every call
// site treats this as fire-and-forget, since a cloud upload failure must
// never affect local backup success or app function (registration keeps
// working fully offline regardless).
async function attemptCloudUploadOfFile(filePath, timeoutMs = 8000) {
    try {
        await withTimeout(uploadBackupFile(filePath), timeoutMs, 'Cloud upload timed out');
    }
    catch (error) {
        console.error('[Main] Automatic cloud upload attempt failed:', error instanceof Error ? error.message : String(error));
    }
}
// Uploads whatever the current latest DAILY local backup is — used by the
// startup/shutdown triggers, which only ever care about that lineage.
// The manual "Backup Now" button instead calls attemptCloudUploadOfFile()
// directly with its own just-created filename (see admin:createBackupNow
// below), since it may produce a manual-snapshot file this function would
// never find.
async function attemptAutomaticCloudUpload(timeoutMs = 8000) {
    try {
        const filePath = getLatestBackupFilePath();
        if (!filePath)
            return;
        await attemptCloudUploadOfFile(filePath, timeoutMs);
    }
    catch (error) {
        console.error('[Main] Automatic cloud upload attempt failed:', error instanceof Error ? error.message : String(error));
    }
}
// Reception's new registrations and Admin's edits both reach the other
// side through the same push-then-pull cycle — see sync.ts's runSyncCycle()
// for why a single, uniform cycle (rather than a special-cased "push-only"
// vs "pull-only" mode per device) is both simpler and safe here. Every
// installation runs the same 2-hour schedule; only the UI each role sees
// differs (Reception surfaces "Sync Now" for its own pending pushes,
// Admin's Settings screen surfaces pull freshness/status).
const SYNC_INTERVAL_MS = 2 * 60 * 60 * 1000;
app.on('ready', () => {
    try {
        initializeDatabase();
    }
    catch (error) {
        console.error('[Main] Failed to initialize database:', error);
        app.quit();
        return;
    }
    createWindow();
    // Fire-and-forget: never block first paint on this.
    ensureTodayBackup()
        .then(() => attemptAutomaticCloudUpload())
        .catch((error) => {
        console.error('[Backup] Startup backup check failed:', error);
    });
    // If this Admin install had LAN Sync Server enabled last time, resume it
    // (and self-pair against it) before the startup sync cycle below, so
    // that cycle already has the right CLOUD_API_URL in place. Never blocks
    // first paint — createWindow() above already ran.
    autoStartLanServerIfEnabled()
        .catch((error) => {
        console.error('[LanServer] Auto-start failed:', error);
    })
        .finally(() => {
        // Catch-up sync on every launch (mirrors ensureTodayBackup()'s
        // startup check) — picks up anything that accumulated while the app
        // was closed, without waiting for the first scheduled tick. Local
        // patient entry never waits on this; a failure here only leaves
        // rows pending for the next attempt.
        runSyncCycle().catch((error) => {
            console.error('[Sync] Startup sync failed:', error);
        });
    });
    setInterval(() => {
        runSyncCycle().catch((error) => {
            console.error('[Sync] Scheduled sync failed:', error);
        });
    }, SYNC_INTERVAL_MS);
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('file://') || url.startsWith('http://localhost:5173')) {
            return { action: 'allow' };
        }
        return { action: 'deny' };
    });
});
let isQuitting = false;
app.on('before-quit', (event) => {
    if (isQuitting) {
        return;
    }
    event.preventDefault();
    isQuitting = true;
    (async () => {
        try {
            // Stop the LAN server first — this app closing means the child
            // process should stop too (see the lifecycle review: simple, always
            // tied to this app's own lifetime, no detached/orphaned process).
            // Uses the shutdown-only variant so a plain app close is never
            // confused with an explicit "Stop Server" click — the server still
            // resumes automatically next launch if it was left enabled.
            await killLanServerForShutdown();
        }
        catch (error) {
            console.error('[LanServer] Stop during shutdown failed:', error);
        }
        try {
            await createBackup();
            await attemptAutomaticCloudUpload(3000);
        }
        catch (error) {
            console.error('[Backup] Shutdown backup attempt failed:', error);
        }
        closeDatabase();
        app.quit();
    })();
});
ipcMain.handle('db:registerPatient', (event, patient) => {
    try {
        return registerPatient(patient);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:registerPatient failed:', message);
        throw error;
    }
});
ipcMain.handle('db:checkDuplicate', (event, patientName, ageYears) => {
    try {
        return checkDuplicate(patientName, ageYears);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:checkDuplicate failed:', message);
        throw error;
    }
});
ipcMain.handle('db:searchPatients', (event, query, registrationDate, includeDeleted) => {
    try {
        return searchPatients(query, registrationDate, includeDeleted);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:searchPatients failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getPatient', (event, id) => {
    try {
        return getPatient(id);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getPatient failed:', message);
        throw error;
    }
});
ipcMain.handle('db:updatePatient', (event, id, updates) => {
    try {
        return updatePatient(id, updates);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:updatePatient failed:', message);
        throw error;
    }
});
// No `db:softDeletePatient` IPC channel — deliberate. Reception/Employee is
// no longer able to delete patients at all (customer decision); Admin never
// used this channel either (Admin only ever restores via
// admin:restorePatient below). Not hidden in the UI only: the channel
// itself doesn't exist, so nothing in the renderer — DevTools console
// included — can invoke it. database.ts's softDeletePatient() function
// stays in place, just unreachable from any current IPC surface, matching
// how SHOW_CLOUD_FEATURES/SHOW_SYNC_UI keep their own logic intact while
// unreachable from the UI.
ipcMain.handle('db:getConsultants', () => {
    try {
        return getConsultants();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getConsultants failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getDepartments', () => {
    try {
        return getDepartments();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getDepartments failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getConsultantsForDepartment', (event, departmentName) => {
    try {
        return getConsultantsForDepartment(departmentName);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getConsultantsForDepartment failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getReturningPatientAddress', (event, patientName) => {
    try {
        return getReturningPatientAddress(patientName);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getReturningPatientAddress failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getDashboardStats', (event, filters) => {
    try {
        return getDashboardStats(filters ?? {});
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getDashboardStats failed:', message);
        throw error;
    }
});
ipcMain.handle('db:previewNextOpdNumber', () => {
    try {
        return previewNextOpdNumber();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:previewNextOpdNumber failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getBackupStatus', () => {
    try {
        return getBackupStatus();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getBackupStatus failed:', message);
        throw error;
    }
});
// ============================================
// IPC Handlers for Admin Operations
// ============================================
ipcMain.handle('admin:hasPassword', () => {
    try {
        return hasAdminPassword();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:hasPassword failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setPassword', (event, password) => {
    try {
        setAdminPassword(password);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setPassword failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:login', (event, password) => {
    try {
        return { success: verifyAdminPassword(password) };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:login failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:changePassword', (event, currentPassword, newPassword) => {
    try {
        return { success: changeAdminPassword(currentPassword, newPassword) };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:changePassword failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:recoverPassword', (event, recoveryCode, newPassword) => {
    try {
        return recoverAdminPassword(recoveryCode, newPassword);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:recoverPassword failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:listConsultants', () => {
    try {
        return listConsultantsAdmin();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:listConsultants failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:addConsultant', (event, name) => {
    try {
        return addConsultant(name);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:addConsultant failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:updateConsultant', (event, id, name) => {
    try {
        updateConsultantName(id, name);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:updateConsultant failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setConsultantActive', (event, id, active) => {
    try {
        setConsultantActive(id, active);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setConsultantActive failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:listDepartments', () => {
    try {
        return listDepartmentsAdmin();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:listDepartments failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:addDepartment', (event, name) => {
    try {
        return addDepartment(name);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:addDepartment failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:updateDepartment', (event, id, name) => {
    try {
        updateDepartmentName(id, name);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:updateDepartment failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setDepartmentActive', (event, id, active) => {
    try {
        setDepartmentActive(id, active);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setDepartmentActive failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:getDepartmentConsultants', (event, departmentId) => {
    try {
        return getDepartmentConsultantIds(departmentId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getDepartmentConsultants failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setDepartmentConsultants', (event, departmentId, consultantIds) => {
    try {
        setDepartmentConsultants(departmentId, consultantIds);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setDepartmentConsultants failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:getAnalytics', (event, filters) => {
    try {
        return getAdminAnalytics(filters ?? {});
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getAnalytics failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:getPatient', (event, id) => {
    try {
        return getPatientAdmin(id);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getPatient failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:restorePatient', (event, id) => {
    try {
        restorePatient(id);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:restorePatient failed:', message);
        throw error;
    }
});
// Excel on Windows opens a .csv by double-click using legacy codepage
// sniffing, not UTF-8, unless the file starts with a UTF-8 BOM — without
// it, Devanagari (and other non-ASCII) text renders as garbled characters
// even though the file itself is valid UTF-8. Plain ASCII content (English
// names, numbers) is unaffected either way; the BOM is invisible once
// Excel recognizes it. Node writes the BOM as its own 3 bytes here — it is
// not part of the CSV string content itself.
const UTF8_BOM = String.fromCharCode(0xfeff);
function writeCsvFile(filePath, csv) {
    fs.writeFileSync(filePath, UTF8_BOM + csv, 'utf-8');
}
ipcMain.handle('admin:exportCsv', async (event, filters) => {
    try {
        const csv = exportPatientsCsv(filters);
        const result = await dialog.showSaveDialog({
            title: 'Export Patients CSV',
            defaultPath: `opd-export-${new Date().toISOString().slice(0, 10)}.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        writeCsvFile(result.filePath, csv);
        return { success: true, filePath: result.filePath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:exportCsv failed:', message);
        throw error;
    }
});
// Same rows exportPatientsCsv above writes to disk — see
// getReportPreviewRows()'s own comment for why that guarantees the preview
// table and the CSV can never show different data.
ipcMain.handle('admin:getReportPreview', (event, filters) => {
    try {
        return getReportPreviewRows(filters);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getReportPreview failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:exportConsultantsCsv', async () => {
    try {
        const csv = exportConsultantsCsv();
        const result = await dialog.showSaveDialog({
            title: 'Export Consultants CSV',
            defaultPath: `opd-consultants-${new Date().toISOString().slice(0, 10)}.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        writeCsvFile(result.filePath, csv);
        return { success: true, filePath: result.filePath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:exportConsultantsCsv failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:exportPatientsListCsv', async (event, query, registrationDate, includeDeleted) => {
    try {
        const csv = exportPatientsListCsv(query, registrationDate, includeDeleted);
        const result = await dialog.showSaveDialog({
            title: 'Export Patients CSV',
            defaultPath: `opd-patients-${new Date().toISOString().slice(0, 10)}.csv`,
            filters: [{ name: 'CSV', extensions: ['csv'] }],
        });
        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }
        writeCsvFile(result.filePath, csv);
        return { success: true, filePath: result.filePath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:exportPatientsListCsv failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:createBackupNow', async () => {
    try {
        // Manual snapshots, not the daily lineage — see createManualBackup()'s
        // own comment for why "Backup Now" must never touch the daily
        // 14-day retention.
        const result = await createManualBackup();
        if (result.success && result.file) {
            // Fire-and-forget — "Back Up Now" is the local-only action; the
            // automatic cloud upload happens in the background regardless of
            // this button's own (already-returned) result. Uploads the exact
            // file just produced, not attemptAutomaticCloudUpload()'s
            // daily-lineage lookup, since this may be a manual-snapshot file.
            const filePath = getLocalBackupFilePath(result.file);
            attemptCloudUploadOfFile(filePath).catch(() => {
                // attemptCloudUploadOfFile() already logs its own failures
            });
        }
        return result;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:createBackupNow failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:listBackups', () => {
    try {
        return listBackups();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:listBackups failed:', message);
        throw error;
    }
});
// ============================================
// IPC Handlers for Local Backup Location
// ============================================
ipcMain.handle('admin:getBackupLocation', () => {
    try {
        return { location: getBackupCustomLocation(), defaultLocation: getDefaultBackupLocation() };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getBackupLocation failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:chooseBackupLocation', async () => {
    try {
        if (!mainWindow)
            return { success: false, canceled: true };
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Choose Backup Folder',
            properties: ['openDirectory', 'createDirectory'],
        });
        const chosen = result.filePaths[0];
        if (result.canceled || !chosen) {
            return { success: false, canceled: true };
        }
        const outcome = setBackupCustomLocation(chosen);
        if (!outcome.success) {
            return { success: false, error: outcome.error ?? 'Could not use that folder.', canceled: false, location: null };
        }
        return { success: true, canceled: false, location: chosen };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:chooseBackupLocation failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:clearBackupLocation', () => {
    try {
        setBackupCustomLocation(null);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:clearBackupLocation failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:openBackupFolder', async () => {
    try {
        const custom = getBackupCustomLocation();
        const useCustom = custom && validateBackupLocation(custom).valid;
        const folderToOpen = useCustom ? custom : getDefaultBackupLocation();
        const error = await shell.openPath(folderToOpen);
        if (error) {
            return { success: false, error };
        }
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
    }
});
// ============================================
// IPC Handlers for Cloud Backup
// ============================================
ipcMain.handle('admin:getCloudBackupStatus', () => {
    try {
        return getCloudBackupStatus();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getCloudBackupStatus failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:listCloudBackups', async () => {
    try {
        return await listCloudBackups();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:listCloudBackups failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:uploadBackupNow', async () => {
    try {
        // Ensures the upload always reflects today's actual current data
        // (reuses the same createBackup() the local "Back Up Now" button
        // does) rather than possibly sending a stale older file.
        const backupResult = await createBackup();
        if (!backupResult.success || !backupResult.file) {
            return { success: false, error: `Could not create a local backup to upload: ${backupResult.error}` };
        }
        const filePath = getLocalBackupFilePath(backupResult.file);
        return await withTimeout(uploadBackupFile(filePath), 20000, 'Cloud upload timed out after 20 seconds');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:uploadBackupNow failed:', message);
        return { success: false, error: message };
    }
});
// ============================================
// IPC Handlers for Data Sync
// ============================================
//
// Deliberately separate from every Backup handler above — Sync Now sends
// current patient records to the central reporting store and pulls the
// latest back; it never touches a backup snapshot file. Available to both
// Employee and Admin renderers (registered outside the admin: namespace)
// since Reception's own "Sync Now" button needs it too, not just Admin's.
ipcMain.handle('sync:syncNow', async () => {
    try {
        return await runSyncCycle();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] sync:syncNow failed:', message);
        return {
            success: false,
            push: { success: false, pushed: 0, failed: 0, error: message },
            pull: { success: false, pulled: 0, error: message },
        };
    }
});
ipcMain.handle('sync:getStatus', () => {
    try {
        return getSyncStatus();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] sync:getStatus failed:', message);
        throw error;
    }
});
// Reception-facing — the "Connect to Hospital Server" flow. Outside the
// admin: namespace for the same reason sync:syncNow above is: Reception's
// renderer calls this directly, never through an Admin-authenticated path.
ipcMain.handle('sync:connectToHospitalServer', async (event, address, pairingCode) => {
    try {
        return await connectToHospitalServer(address, pairingCode);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] sync:connectToHospitalServer failed:', message);
        return { success: false, error: message };
    }
});
// ============================================
// IPC Handlers for the LAN Sync Server (Admin-managed child process)
// ============================================
ipcMain.handle('admin:getLanServerStatus', () => {
    try {
        return getLanServerStatus();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getLanServerStatus failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:startLanServer', async () => {
    try {
        return await startLanServer();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:startLanServer failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:stopLanServer', async () => {
    try {
        return await stopLanServer();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:stopLanServer failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:restartLanServer', async () => {
    try {
        return await restartLanServer();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:restartLanServer failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:getLanAddresses', () => {
    try {
        return getLanAddresses();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getLanAddresses failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:generateLanPairingCode', async () => {
    try {
        return await generatePairingCode();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:generateLanPairingCode failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setLanServerPort', (event, port) => {
    try {
        setLanServerPortConfig(port);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setLanServerPort failed:', message);
        throw error;
    }
});
// ============================================
// IPC Handler for Restore
// ============================================
//
// Safe sequence: verify integrity of the chosen file -> copy it to its own
// temp path -> snapshot the CURRENT live database (while still open, so it
// can always be undone) -> close the database -> replace the live file
// with the temp copy -> relaunch the whole app rather than reinitializing
// in place, so no stale in-memory renderer state can reference data that
// no longer makes sense after the swap.
//
// The temp-copy step exists for a real, non-hypothetical case: restoring
// from TODAY's own daily backup means the chosen file and the safety
// snapshot below target the exact same path (createBackup() always writes
// to today's dated filename) — without copying the verified source out of
// the way first, the safety snapshot would silently overwrite the very
// bytes this restore is about to read, before replaceLiveDatabaseFile()
// ever uses them. Restoring "today's backup" would then just re-apply
// whatever the database already currently held, not the intended point in
// time — confirmed by testing, not hypothetical.
ipcMain.handle('admin:restoreBackup', async (_event, source) => {
    let tempDownloadPath = null;
    let tempSourceCopyPath = null;
    try {
        let sourcePath;
        if (source.type === 'cloud') {
            tempDownloadPath = path.join(app.getPath('temp'), `unani-restore-${Date.now()}-${source.filename}`);
            await downloadCloudBackup(source.filename, tempDownloadPath);
            sourcePath = tempDownloadPath;
        }
        else {
            sourcePath = getLocalBackupFilePath(source.filename);
        }
        if (!fs.existsSync(sourcePath)) {
            return { success: false, error: 'Selected backup file could not be found.' };
        }
        if (!verifyBackup(sourcePath)) {
            return { success: false, error: 'Selected backup failed integrity check — restore aborted. No changes were made.' };
        }
        // A cloud restore's sourcePath is already a dedicated temp download
        // path, never a path createBackup() could target — only a local
        // restore needs this extra copy.
        if (source.type === 'local') {
            tempSourceCopyPath = path.join(app.getPath('temp'), `unani-restore-source-${Date.now()}-${source.filename}`);
            fs.copyFileSync(sourcePath, tempSourceCopyPath);
            sourcePath = tempSourceCopyPath;
        }
        const safety = await createBackup();
        if (!safety.success) {
            return {
                success: false,
                error: `Could not create a safety snapshot of the current database before restoring: ${safety.error}. No changes were made.`,
            };
        }
        closeDatabase();
        replaceLiveDatabaseFile(sourcePath);
        app.relaunch();
        app.exit(0);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:restoreBackup failed:', message);
        return { success: false, error: message };
    }
    finally {
        if (tempDownloadPath) {
            try {
                fs.unlinkSync(tempDownloadPath);
            }
            catch {
                // ignore — app may already be exiting on the success path
            }
        }
        if (tempSourceCopyPath) {
            try {
                fs.unlinkSync(tempSourceCopyPath);
            }
            catch {
                // ignore — app may already be exiting on the success path
            }
        }
    }
});
