import express, { type Express } from "express";
import type Database from "better-sqlite3";
import type { BackupStorage } from "./storage.js";
import { requireDeviceAuth } from "./auth.js";
import { createAuthRouter } from "./routes/auth.js";
import { createBackupRouter } from "./routes/backup.js";
import { createSyncRouter } from "./routes/sync.js";
import { createPairingRouter } from "./routes/pairing.js";

// Pure Express app construction — no env reading, no listen(), no process-
// level side effects. Extracted out of index.ts so this exact wiring can be
// reused both by the standalone CLI (index.ts) and by startServer.ts (used
// when the Admin Electron app runs this as a managed child process).
// Nothing about routing/auth/backup/sync behavior changes by existing here
// instead of in index.ts — this is the same code, moved.
export function createApp(db: Database.Database, storage: BackupStorage, deviceSetupToken: string): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", createAuthRouter(db, deviceSetupToken));

  const authedBackupRouter = express.Router();
  authedBackupRouter.use(requireDeviceAuth(db));
  authedBackupRouter.post("/upload", express.raw({ type: "application/octet-stream", limit: "100mb" }));
  authedBackupRouter.use(createBackupRouter(db, storage));
  app.use("/backup", authedBackupRouter);

  const authedSyncRouter = express.Router();
  authedSyncRouter.use(requireDeviceAuth(db));
  authedSyncRouter.use(createSyncRouter(db));
  app.use("/sync", authedSyncRouter);

  // Minting a pairing code requires being an already-paired device — same
  // auth middleware as /backup and /sync above.
  const authedPairingRouter = express.Router();
  authedPairingRouter.use(requireDeviceAuth(db));
  authedPairingRouter.use(createPairingRouter(db));
  app.use("/auth/pairing-code", authedPairingRouter);

  return app;
}
