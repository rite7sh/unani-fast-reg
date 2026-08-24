import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, closeDatabase, registerPatient, checkDuplicate, searchPatients, getPatient, updatePatient, softDeletePatient, getDiagnoses, getConsultants, getReturningPatientAddress, getDashboardStats, previewNextOpdNumber, createBackup, ensureTodayBackup, getBackupStatus, hasAdminPassword, setAdminPassword, verifyAdminPassword, changeAdminPassword, listDiagnosesAdmin, addDiagnosis, updateDiagnosisName, setDiagnosisActive, listConsultantsAdmin, addConsultant, updateConsultantName, setConsultantActive, listDepartmentsAdmin, addDepartment, updateDepartmentName, setDepartmentActive, getDepartmentsForDiagnosis, getConsultantsForDepartment, getDiagnosisDepartmentIds, setDiagnosisDepartments, getDepartmentConsultantIds, setDepartmentConsultants, getAdminAnalytics, getPatientAdmin, restorePatient, exportPatientsCsv, listBackups, } from './database.cjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    ensureTodayBackup().catch((error) => {
        console.error('[Backup] Startup backup check failed:', error);
    });
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
    createBackup()
        .catch((error) => {
        console.error('[Backup] Shutdown backup attempt failed:', error);
    })
        .finally(() => {
        closeDatabase();
        app.quit();
    });
});
// ============================================
// IPC Handlers for Database Operations
// ============================================
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
ipcMain.handle('db:softDeletePatient', (event, id) => {
    try {
        softDeletePatient(id);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:softDeletePatient failed:', message);
        throw error;
    }
});
ipcMain.handle('db:getDiagnoses', () => {
    try {
        return getDiagnoses();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getDiagnoses failed:', message);
        throw error;
    }
});
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
ipcMain.handle('db:getDepartmentsForDiagnosis', (event, diagnosisName) => {
    try {
        return getDepartmentsForDiagnosis(diagnosisName);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] db:getDepartmentsForDiagnosis failed:', message);
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
ipcMain.handle('db:getDashboardStats', () => {
    try {
        return getDashboardStats();
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
ipcMain.handle('admin:listDiagnoses', () => {
    try {
        return listDiagnosesAdmin();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:listDiagnoses failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:addDiagnosis', (event, name) => {
    try {
        return addDiagnosis(name);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:addDiagnosis failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:updateDiagnosis', (event, id, name) => {
    try {
        updateDiagnosisName(id, name);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:updateDiagnosis failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setDiagnosisActive', (event, id, active) => {
    try {
        setDiagnosisActive(id, active);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setDiagnosisActive failed:', message);
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
ipcMain.handle('admin:getDiagnosisDepartments', (event, diagnosisId) => {
    try {
        return getDiagnosisDepartmentIds(diagnosisId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:getDiagnosisDepartments failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:setDiagnosisDepartments', (event, diagnosisId, departmentIds) => {
    try {
        setDiagnosisDepartments(diagnosisId, departmentIds);
        return { success: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:setDiagnosisDepartments failed:', message);
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
ipcMain.handle('admin:getAnalytics', () => {
    try {
        return getAdminAnalytics();
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
        fs.writeFileSync(result.filePath, csv, 'utf-8');
        return { success: true, filePath: result.filePath };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[IPC] admin:exportCsv failed:', message);
        throw error;
    }
});
ipcMain.handle('admin:createBackupNow', async () => {
    try {
        return await createBackup();
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
