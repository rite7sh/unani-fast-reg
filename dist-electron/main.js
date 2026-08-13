import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
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
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok || response.status === 404) {
                // 404 is fine - means the server is running
                console.log(`[Electron] Found Vite dev server on port ${port}`);
                return url;
            }
        }
        catch (e) {
            // Port not available, try next
        }
    }
    // If none found, default to 9999
    console.warn('[Electron] Could not find Vite server, defaulting to 9999');
    return 'http://localhost:9999';
}
function getDevServerURL() {
    // For development, try to find the actual port Vite is using
    // This handles cases where Vite had to use a different port
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
    // Add diagnostic listeners
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Electron] did-fail-load: code=${errorCode}, desc="${errorDescription}", url="${validatedURL}"`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Electron] did-finish-load - page loaded successfully');
    });
    mainWindow.webContents.on('console-message', (level, message, line, sourceId) => {
        console.log(`[Renderer L${line}] ${message}`);
    });
    // Try development server first, regardless of NODE_ENV
    // This handles cases where NODE_ENV isn't set properly in npm scripts
    console.log('[Electron] Attempting to connect to dev server...');
    getDevServerURL().then(devURL => {
        console.log(`[Electron] Found dev server at: ${devURL}`);
        mainWindow?.loadURL(devURL);
    }).catch(err => {
        // Dev server not found, fall back to production build
        console.log('[Electron] Dev server not found, loading from production build...');
        const indexPath = path.join(__dirname, '../dist/index.html');
        console.log(`[Electron] Loading production from: ${indexPath}`);
        mainWindow?.loadFile(indexPath);
    });
    // Open DevTools for debugging
    mainWindow.webContents.openDevTools();
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// Create window when Electron is ready
app.on('ready', createWindow);
// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// Re-create window when dock icon is clicked on macOS
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
// Prevent opening new windows
app.on('web-contents-created', (_, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        // Allow only internal navigation
        if (url.startsWith('file://') || url.startsWith('http://localhost:5173')) {
            return { action: 'allow' };
        }
        // Deny all other URLs
        return { action: 'deny' };
    });
});
