import crypto from "node:crypto";
import { Router } from "express";
import type Database from "better-sqlite3";
import type { BackupRow } from "../db.js";
import type { BackupStorage } from "../storage.js";

// Backup filenames are always server-validated against one of these two
// exact shapes — the daily lineage ("opd-backup-YYYY-MM-DD.db") and the
// manual-snapshot lineage ("opd-manual-YYYY-MM-DD-HHMMSS.db"), matching
// electron/database.ts exactly — never trusted as a raw client-supplied
// path component.
const FILENAME_PATTERN = /^opd-(?:backup-\d{4}-\d{2}-\d{2}|manual-\d{4}-\d{2}-\d{2}-\d{6})\.db$/;

export function createBackupRouter(db: Database.Database, storage: BackupStorage) {
  const router = Router();

  // Body is the raw .db file bytes (application/octet-stream) — a whole
  // SQLite snapshot is a single opaque blob; there's no structured form
  // data to parse, so a raw body is simpler than multipart and needs no
  // extra dependency.
  router.post("/upload", async (req, res) => {
    const device = req.device!;
    const filename = req.header("x-filename");
    const claimedSha256 = req.header("x-sha256");

    if (!filename || !FILENAME_PATTERN.test(filename)) {
      res.status(400).json({ error: "Missing or invalid X-Filename header" });
      return;
    }
    if (!claimedSha256) {
      res.status(400).json({ error: "Missing X-Sha256 header" });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Empty or missing request body" });
      return;
    }

    const actualSha256 = crypto.createHash("sha256").update(req.body).digest("hex");
    if (actualSha256 !== claimedSha256.toLowerCase()) {
      // Catches a truncated/corrupted transfer — the one thing this check
      // exists for. Never store bytes that don't match what the client
      // says it sent.
      res.status(422).json({ error: "Checksum mismatch — upload did not arrive intact" });
      return;
    }

    const existing = db
      .prepare("SELECT * FROM backups WHERE hospital_id = ? AND device_id = ? AND filename = ?")
      .get(device.hospital_id, device.device_id, filename) as BackupRow | undefined;

    if (existing && existing.sha256 === actualSha256) {
      // Identical bytes already stored under this filename — nothing to
      // do. Satisfies "avoid duplicate uploads" without any client-side
      // bookkeeping being load-bearing (the client may legitimately not
      // know whether a prior attempt actually landed, e.g. after a
      // connection drop right at the response).
      res.json({ status: "already-current", filename, sizeBytes: existing.size_bytes });
      return;
    }

    // device_id is part of the key, not just the filename — two different
    // machines (Reception, Admin) can each produce a same-named daily/
    // manual snapshot; without this, the second upload would silently
    // overwrite the first machine's backup, in storage AND in this table.
    const storageKey = `${device.hospital_id}/${device.device_id}/${filename}`;
    try {
      await storage.put(storageKey, req.body);
    } catch (error) {
      // Express 4 does not catch a rejected promise from an async route
      // handler on its own — left unhandled, this would crash the whole
      // process (Node terminates on an unhandled rejection by default),
      // taking down the other device's uploads and sync too, not just
      // this one request. A storage failure (R2 unreachable, credentials
      // rejected, etc.) must only ever fail THIS upload.
      console.error(`[Backup] Storage write failed for ${storageKey}:`, error instanceof Error ? error.message : error);
      res.status(502).json({ error: "Backup storage is temporarily unavailable — please retry." });
      return;
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO backups (hospital_id, device_id, filename, storage_key, size_bytes, sha256, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hospital_id, device_id, filename) DO UPDATE SET
         storage_key = excluded.storage_key,
         size_bytes = excluded.size_bytes,
         sha256 = excluded.sha256,
         uploaded_at = excluded.uploaded_at`
    ).run(device.hospital_id, device.device_id, filename, storageKey, req.body.length, actualSha256, now);

    res.json({ status: "stored", filename, sizeBytes: req.body.length, uploadedAt: now });
  });

  // Scoped to the CALLING device's own backups only — not every backup for
  // the hospital. Reception and Admin are separate local databases; an
  // install must only ever see (and, via /download below, be able to
  // restore) its own disaster-recovery history, never the other machine's
  // entirely different database.
  router.get("/list", (req, res) => {
    const device = req.device!;
    // Sorted by uploaded_at, not filename — "opd-backup-" and "opd-manual-"
    // don't interleave correctly by date when sorted lexically against
    // each other (matching the same fix in electron/database.ts's
    // listBackups()).
    const rows = db
      .prepare(
        "SELECT filename, size_bytes, sha256, uploaded_at FROM backups WHERE hospital_id = ? AND device_id = ? ORDER BY uploaded_at DESC"
      )
      .all(device.hospital_id, device.device_id) as Pick<BackupRow, "filename" | "size_bytes" | "sha256" | "uploaded_at">[];
    res.json(
      rows.map((r) => ({ filename: r.filename, sizeBytes: r.size_bytes, sha256: r.sha256, uploadedAt: r.uploaded_at }))
    );
  });

  // Also device-scoped — see the /list comment above. A filename alone is
  // not enough to identify a backup once two devices can share one; the
  // calling device can only ever download its own.
  router.get("/download/:filename", async (req, res) => {
    const device = req.device!;
    const { filename } = req.params;
    if (!FILENAME_PATTERN.test(filename)) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    const row = db
      .prepare("SELECT * FROM backups WHERE hospital_id = ? AND device_id = ? AND filename = ?")
      .get(device.hospital_id, device.device_id, filename) as BackupRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    let data: Buffer | null;
    try {
      data = await storage.get(row.storage_key);
    } catch (error) {
      // Same reasoning as the /upload try/catch above — never let a
      // storage-layer failure become an unhandled rejection here.
      console.error(`[Backup] Storage read failed for ${row.storage_key}:`, error instanceof Error ? error.message : error);
      res.status(502).json({ error: "Backup storage is temporarily unavailable — please retry." });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Backup metadata exists but the stored file is missing" });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Sha256", row.sha256);
    res.send(data);
  });

  return router;
}
