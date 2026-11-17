import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import type { DeviceRow } from "./db.js";

export function generateDeviceId(): string {
  return crypto.randomUUID();
}

export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

// Short, human-typeable, single-use pairing codes — the thing an Admin
// hands to Reception, never the permanent DEVICE_SETUP_TOKEN itself. Safe
// alphabet only (no 0/O or 1/I/L) since a person reads this off one screen
// and types it into another a few feet away. 8 characters from a 32-symbol
// alphabet is ~40 bits of entropy — ample for a code that's single-use and
// expires in minutes, not a long-lived credential.
const PAIRING_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generatePairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Extends Express's Request type so route handlers can read the
// authenticated device without re-casting on every access.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: DeviceRow;
    }
  }
}

// Every route except POST /auth/device requires this. Auth is by device,
// not by user — this app has no real user-account model to extend, and a
// pre-shared per-device key is proportionate for a small, fixed set of
// known physical machines (see the architecture report, Section 12).
export function requireDeviceAuth(db: Database.Database) {
  return (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.header("x-device-id");
    const authHeader = req.header("authorization") ?? "";
    const apiKey = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

    if (!deviceId || !apiKey) {
      res.status(401).json({ error: "Missing device credentials" });
      return;
    }

    const row = db.prepare("SELECT * FROM devices WHERE device_id = ?").get(deviceId) as DeviceRow | undefined;
    if (!row || row.api_key_hash !== hashApiKey(apiKey)) {
      res.status(401).json({ error: "Invalid device credentials" });
      return;
    }

    db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
    req.device = row;
    next();
  };
}
