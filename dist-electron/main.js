import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, closeDatabase, registerPatient, checkDuplicate, searchPatients, getPatient, updatePatient, softDeletePatient, getDiagnoses, getConsultants, getReturningPatientAddress, } from './database.cjs';
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
    mainWindow.webContents.openDevTools();
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
app.on('before-quit', () => {
    closeDatabase();
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
ipcMain.handle('db:searchPatients', (event, query) => {
    try {
        return searchPatients(query);
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
