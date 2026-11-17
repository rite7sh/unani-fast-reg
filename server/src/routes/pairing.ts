import { Router } from "express";
import type Database from "better-sqlite3";
import { generatePairingCode } from "../auth.js";

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to read a screen and type it on another PC, short enough that a forgotten/unused code doesn't linger as a standing way in.

// Mounted under the SAME auth-required router as /backup and /sync — only
// an already-paired device (in practice, Admin, right after it self-pairs
// against its own just-started server) can mint a code. This is the one
// and only way a pairing code comes into existence; nothing here ever
// touches or reveals the permanent DEVICE_SETUP_TOKEN.
export function createPairingRouter(db: Database.Database) {
  const router = Router();

  router.post("/", (req, res) => {
    const device = req.device!;
    const code = generatePairingCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);

    db.prepare(
      `INSERT INTO pairing_codes (code, hospital_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
    ).run(code, device.hospital_id, now.toISOString(), expiresAt.toISOString());

    res.json({ code, expiresAt: expiresAt.toISOString() });
  });

  return router;
}
