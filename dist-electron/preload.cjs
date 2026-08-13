"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Secure context bridge - only expose what's necessary
electron_1.contextBridge.exposeInMainWorld('electron', {
    // Version information for testing
    versions: {
        node: () => process.versions.node,
        electron: () => process.versions.electron,
        app: () => process.versions.app,
    },
    // Minimal health check API
    health: {
        ping: () => 'pong',
    },
    // IPC for future use (add specific methods as needed)
    ipc: {
        send: (channel, data) => {
            electron_1.ipcRenderer.send(channel, data);
        },
        receive: (channel, callback) => {
            electron_1.ipcRenderer.on(channel, (event, data) => callback(data));
        },
        invoke: (channel, data) => {
            return electron_1.ipcRenderer.invoke(channel, data);
        },
        // Remove listener when done
        removeListener: (channel) => {
            electron_1.ipcRenderer.removeAllListeners(channel);
        },
    },
});
// Inform main process that preload is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Preload] IPC bridge ready');
});
