import { Router } from "express";
import type Database from "better-sqlite3";
import { generateApiKey, generateDeviceId, hashApiKey } from "../auth.js";
import type { PairingCodeRow } from "../db.js";

// One-time device pairing. Two ways in:
//   - setupToken: the permanent, server-side-only secret (DEVICE_SETUP_TOKEN)
//     — unchanged from before, kept for development/manual fallback. Never
//     shown in any app UI.
//   - pairingCode: a short-lived, single-use code minted by an
//     already-paired device via POST /auth/pairing-code (see
//     routes/pairing.ts) — what the Admin app's UI actually hands to
//     Reception. Scopes the new device to whatever hospital_id the code
//     was minted under, not a client-supplied value.
export function createAuthRouter(db: Database.Database, setupToken: string) {
  const router = Router();

  router.post("/device", (req, res) => {
    const { setupToken: providedToken, pairingCode, hospitalId, label } = req.body ?? {};

    let resolvedHospitalId: string;

    if (typeof pairingCode === "string" && pairingCode) {
      const row = db.prepare("SELECT * FROM pairing_codes WHERE code = ?").get(pairingCode) as
        | PairingCodeRow
        | undefined;
      const now = new Date().toISOString();
      if (!row || row.used_at || row.expires_at <= now) {
        res.status(403).json({ error: "Invalid or expired pairing code" });
        return;
      }
      // Marked used immediately, before the device row is even created —
      // a retried/duplicate request for the same code must never pair
      // twice, and this is the single place that decides "this code is
      // spent."
      db.prepare("UPDATE pairing_codes SET used_at = ? WHERE code = ?").run(now, pairingCode);
      resolvedHospitalId = row.hospital_id;
    } else if (typeof providedToken === "string" && providedToken === setupToken) {
      if (typeof hospitalId !== "string" || !hospitalId.trim()) {
        res.status(400).json({ error: "hospitalId is required" });
        return;
      }
      resolvedHospitalId = hospitalId.trim();
    } else if (typeof providedToken === "string") {
      res.status(403).json({ error: "Invalid setup token" });
      return;
    } else {
      res.status(400).json({ error: "setupToken or pairingCode is required" });
      return;
    }

    const deviceId = generateDeviceId();
    const apiKey = generateApiKey();

    db.prepare(
      `INSERT INTO devices (device_id, api_key_hash, hospital_id, label, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(deviceId, hashApiKey(apiKey), resolvedHospitalId, typeof label === "string" ? label : null, new Date().toISOString());

    res.json({ deviceId, apiKey });
  });

  return router;
}
