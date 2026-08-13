interface ElectronAPI {
  versions: {
    node: () => string;
    electron: () => string;
    app: () => string;
  };
  health: {
    ping: () => string;
  };
  ipc: {
    send: (channel: string, data?: unknown) => void;
    receive: (channel: string, callback: (data: unknown) => void) => void;
    invoke: (channel: string, data?: unknown) => Promise<unknown>;
    removeListener: (channel: string) => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
