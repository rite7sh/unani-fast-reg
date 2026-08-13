import { contextBridge, ipcRenderer } from 'electron';

// Secure context bridge - only expose what's necessary
contextBridge.exposeInMainWorld('electron', {
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
    send: (channel: string, data?: unknown) => {
      ipcRenderer.send(channel, data);
    },
    receive: (channel: string, callback: (data: unknown) => void) => {
      ipcRenderer.on(channel, (event, data) => callback(data));
    },
    invoke: (channel: string, data?: unknown) => {
      return ipcRenderer.invoke(channel, data);
    },
    // Remove listener when done
    removeListener: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
});

// Inform main process that preload is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Preload] IPC bridge ready');
});
