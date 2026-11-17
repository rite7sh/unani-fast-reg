import type { Server } from "node:http";
import { openDb } from "./db.js";
import { LocalFileStorage, R2Storage, type BackupStorage, type R2Config } from "./storage.js";
import { createApp } from "./app.js";

export interface StartServerConfig {
  port: number;
  host?: string;
  deviceSetupToken: string;
  dbPath: string;
  storageDir?: string;
  r2?: R2Config;
}

export interface RunningServer {
  httpServer: Server;
  port: number;
  close: () => Promise<void>;
}

// Reusable entry point — the standalone CLI (index.ts) and the Admin
// Electron app's managed child process (electron/lanServer.ts) both call
// this with the exact same config shape and get the exact same server.
// Unlike index.ts's top-level script, this never calls process.exit(): a
// misconfiguration or a port already in use is reported by rejecting the
// returned promise, so the caller (whichever one it is) decides what to do
// about it instead of the whole process dying.
export async function startServer(config: StartServerConfig): Promise<RunningServer> {
  const db = openDb(config.dbPath);
  const storage: BackupStorage = config.r2
    ? new R2Storage(config.r2)
    : new LocalFileStorage(config.storageDir ?? "./data/storage");

  const app = createApp(db, storage, config.deviceSetupToken);
  const host = config.host ?? "0.0.0.0";

  const httpServer = await new Promise<Server>((resolve, reject) => {
    const server = app.listen(config.port, host);
    // 'listening' and 'error' are mutually exclusive for a single listen()
    // call — exactly one of these fires. Removing the other's listener
    // avoids a stray 'error' handler lingering on the server past startup
    // (a genuine runtime error afterwards should still surface normally,
    // e.g. via the server's own default behavior / the caller's own
    // handling of httpServer, not this one-shot startup listener).
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server);
    };
    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${config.port} is already in use by another program.`));
      } else {
        reject(error);
      }
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });

  return {
    httpServer,
    port: config.port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
        db.close();
      }),
  };
}
