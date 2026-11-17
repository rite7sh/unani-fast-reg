import "dotenv/config";
import path from "node:path";
import { startServer } from "./startServer.js";

// Standalone CLI entry point — `npm run dev` / `npm start`. Behavior here
// is unchanged from before the app.ts/startServer.ts split: same env vars,
// same validation, same process.exit(1) on misconfiguration. That's safe
// here specifically because this file only ever runs as its own top-level
// process (never imported) — see startServer.ts for the reusable version
// the Admin Electron app's managed child process calls instead, which
// never calls process.exit() and reports failure by rejecting a promise.

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEVICE_SETUP_TOKEN = process.env.DEVICE_SETUP_TOKEN ?? "";
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR ?? "./data/storage");
const DB_PATH = path.resolve(process.env.DB_PATH ?? "./data/server.db");

// Cloudflare R2 — all optional so local development keeps working with
// zero configuration (LocalFileStorage). In production, set all four and
// nothing else about this file changes; see .env.example.
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? "";
const R2_BUCKET = process.env.R2_BUCKET ?? "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? "";
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
const R2_PARTIALLY_CONFIGURED =
  !R2_CONFIGURED && !!(R2_ACCOUNT_ID || R2_BUCKET || R2_ACCESS_KEY_ID || R2_SECRET_ACCESS_KEY);

if (!DEVICE_SETUP_TOKEN) {
  console.error("[server] DEVICE_SETUP_TOKEN is not set — refusing to start. Copy .env.example to .env first.");
  process.exit(1);
}
if (R2_PARTIALLY_CONFIGURED) {
  console.error(
    "[server] Some R2_* environment variables are set but not all four (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are all required together) — refusing to start rather than silently falling back to local disk storage."
  );
  process.exit(1);
}

startServer({
  port: PORT,
  host: HOST,
  deviceSetupToken: DEVICE_SETUP_TOKEN,
  dbPath: DB_PATH,
  storageDir: STORAGE_DIR,
  r2: R2_CONFIGURED
    ? { accountId: R2_ACCOUNT_ID, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY }
    : undefined,
})
  .then(({ port }) => {
    console.log(`[server] Unani OPD cloud-backup API listening on http://${HOST}:${port} (reachable from other machines on the same network)`);
    console.log(`[server] Metadata DB: ${DB_PATH}`);
    console.log(`[server] Backup storage: ${R2_CONFIGURED ? `R2 (bucket: ${R2_BUCKET})` : `local disk (${STORAGE_DIR})`}`);
  })
  .catch((error) => {
    console.error("[server] Failed to start:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
