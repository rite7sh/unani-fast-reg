import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// This database holds ONLY sync/backup metadata — device records and a
// pointer to each uploaded backup file (name, size, checksum, when). It
// never holds patient data; the actual .db snapshot bytes live in
// whatever BackupStorage implementation is configured (storage.ts).

export function openDb(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      api_key_hash TEXT NOT NULL,
      hospital_id TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT
    );

    -- UNIQUE is (hospital_id, device_id, filename), not (hospital_id,
    -- filename) — Reception and Admin are two separate local databases that
    -- each produce their own daily/manual snapshot files, and those files
    -- can legitimately share a filename by date coincidence (e.g. both
    -- upload "opd-backup-2026-08-28.db" the same day). Without device_id in
    -- the key, the second upload would silently overwrite the first
    -- machine's backup under the same row/storage key. See storage.ts's
    -- storageKey construction, which mirrors this exact scoping.
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(hospital_id, device_id, filename)
    );

    -- Structured operational data for reporting sync — deliberately a
    -- separate table from "backups" above. "backups" stores pointers to
    -- opaque whole-database snapshot files (disaster recovery); this table
    -- stores individual patient rows in structured columns a query can
    -- actually filter/aggregate on (operational sync). One hospital's
    -- current view of every patient any paired device has pushed, keyed by
    -- opd_no so a re-push of the same record is an update, never a new row.
    CREATE TABLE IF NOT EXISTS patient_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id TEXT NOT NULL,
      opd_no TEXT NOT NULL,
      registration_date TEXT NOT NULL,
      registration_time TEXT,
      patient_name TEXT NOT NULL,
      age_years INTEGER NOT NULL,
      age_months INTEGER NOT NULL,
      gender TEXT NOT NULL,
      address TEXT NOT NULL,
      aadhaar_number TEXT,
      mobile_number TEXT,
      department TEXT,
      consultant TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      device_id TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(hospital_id, opd_no)
    );

    CREATE INDEX IF NOT EXISTS idx_patient_sync_cursor ON patient_sync(hospital_id, synced_at);

    -- Short-lived, single-use codes an already-paired device (Admin) mints
    -- so a new device (Reception) can pair without ever seeing the
    -- permanent DEVICE_SETUP_TOKEN. code is the primary key, not a
    -- generated id — lookups are always "does this exact code exist and is
    -- it still valid", never enumerated. used_at is set the moment a code
    -- is consumed, immediately making it invalid for any further attempt
    -- (including a retried/duplicate request racing the first).
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      hospital_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);

  // CREATE TABLE IF NOT EXISTS above is a no-op against a patient_sync
  // table that already existed before registration_time was added to it —
  // same additive-column situation electron/database.ts already handles
  // for its own patients table, same fix.
  const patientSyncColumns = db.prepare("PRAGMA table_info(patient_sync)").all() as { name: string }[];
  if (!patientSyncColumns.some((c) => c.name === "registration_time")) {
    db.exec("ALTER TABLE patient_sync ADD COLUMN registration_time TEXT");
  }

  return db;
}

export type DeviceRow = {
  id: number;
  device_id: string;
  api_key_hash: string;
  hospital_id: string;
  label: string | null;
  created_at: string;
  last_seen_at: string | null;
};

export type BackupRow = {
  id: number;
  hospital_id: string;
  device_id: string;
  filename: string;
  storage_key: string;
  size_bytes: number;
  sha256: string;
  uploaded_at: string;
};

export type PairingCodeRow = {
  code: string;
  hospital_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export type PatientSyncRow = {
  id: number;
  hospital_id: string;
  opd_no: string;
  registration_date: string;
  registration_time: string | null;
  patient_name: string;
  age_years: number;
  age_months: number;
  gender: string;
  address: string;
  aadhaar_number: string | null;
  mobile_number: string | null;
  department: string | null;
  consultant: string;
  employee_id: string;
  is_deleted: number;
  source_created_at: string;
  source_updated_at: string;
  device_id: string;
  synced_at: string;
};
