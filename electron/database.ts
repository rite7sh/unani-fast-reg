import { app } from 'electron';
import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';

const Database = require('better-sqlite3') as any;

export interface Patient {
  id?: number;
  opd_no: string;
  registration_date: string;
  // HH:mm:ss, local time — captured automatically at registerPatient()'s
  // insert time (see formatLocalTime()); never set by the caller. Nullable
  // only because it's absent on records from before this column existed
  // and had no created_at to backfill from.
  registration_time?: string | null;
  patient_name: string;
  age_years: number;
  age_months: number;
  gender: string;
  address: string;
  aadhaar_number?: string;
  mobile_number?: string;
  // Legacy — Diagnosis was removed as a concept. The columns and any
  // historical values stay in the database (see initializeDatabase()'s
  // migration comment) and getPatient()/getPatientAdmin() still return
  // them via SELECT *, but nothing writes or displays them anymore.
  diagnosis?: string;
  diagnosis_other?: string;
  department?: string;
  consultant: string;
  employee_id: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  synced?: number;
  last_synced_at?: string | null;
  sync_error?: string | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingPatient?: {
    id: number;
    opd_no: string;
    patient_name: string;
    registration_date: string;
  };
}

export interface SearchResult {
  id: number;
  opd_no: string;
  patient_name: string;
  age_years: number;
  age_months: number;
  gender: string;
  address: string;
  registration_date: string;
  registration_time: string | null;
  department: string | null;
  consultant: string;
  is_deleted: number;
}

let db: any = null;
let isInitialized = false;

function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  return path.join(dataDir, 'opd.db');
}

// Adds `column` to `table` only if it doesn't already exist. SQLite has no
// `ADD COLUMN IF NOT EXISTS`, so this is the guard that makes an
// `ALTER TABLE` safe to run on every startup against a database that may
// already have the column from a prior run.
function addColumnIfMissing(table: string, column: string, type: string): void {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// HH:mm:ss from a Date's LOCAL time components — never UTC. created_at
// stores toISOString() (UTC), so this is deliberately not reused for that
// column; it's the one place registration_time is computed, for both new
// registrations (registerPatient()) and the historical backfill below.
function formatLocalTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// One-time-per-row backfill: existing patients have no registration_time
// (the column was just added, nullable, on every row). created_at is a
// precise UTC instant already on every row (NOT NULL since the table was
// created), so re-parsing it with `new Date()` and reading LOCAL time
// components on this same machine correctly reconstructs the original
// wall-clock registration time — this is a single-machine, single-timezone
// desktop install, so "this machine's current local time interpretation of
// that instant" is the same timezone the registration actually happened
// in. Idempotent (only ever touches rows still NULL) and safe to call on
// every startup. Never invents a time for a row with no created_at.
function backfillRegistrationTime(): void {
  const rows = db
    .prepare(`SELECT id, created_at FROM patients WHERE registration_time IS NULL AND created_at IS NOT NULL`)
    .all() as { id: number; created_at: string }[];
  if (rows.length === 0) return;

  const update = db.prepare('UPDATE patients SET registration_time = ? WHERE id = ?');
  const run = db.transaction((items: { id: number; created_at: string }[]) => {
    for (const row of items) {
      const parsed = new Date(row.created_at);
      if (isNaN(parsed.getTime())) continue; // malformed created_at — left NULL, never guessed
      update.run(formatLocalTime(parsed), row.id);
    }
  });
  run(rows);
  console.log(`[Database] Backfilled registration_time for ${rows.length} existing record(s)`);
}

export function initializeDatabase(): void {
  if (isInitialized && db) {
    return;
  }

  const dbPath = getDatabasePath();
  console.log(`[Database] Opening database at: ${dbPath}`);

  try {
    db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opd_no TEXT NOT NULL UNIQUE,
        registration_date TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        age_years INTEGER NOT NULL,
        age_months INTEGER NOT NULL,
        gender TEXT NOT NULL,
        address TEXT NOT NULL,
        diagnosis TEXT NOT NULL,
        diagnosis_other TEXT,
        consultant TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0,
        last_synced_at TEXT,
        sync_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_opd_no ON patients(opd_no);
      CREATE INDEX IF NOT EXISTS idx_registration_date ON patients(registration_date);
      CREATE INDEX IF NOT EXISTS idx_patient_name ON patients(patient_name);
      CREATE INDEX IF NOT EXISTS idx_is_deleted ON patients(is_deleted);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS consultants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_consultants_active ON consultants(active);

      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(active);

      CREATE TABLE IF NOT EXISTS department_consultants (
        department_id INTEGER NOT NULL REFERENCES departments(id),
        consultant_id INTEGER NOT NULL REFERENCES consultants(id),
        PRIMARY KEY (department_id, consultant_id)
      );
    `);

    // Diagnosis was removed as an application concept. diagnoses/
    // diagnosis_departments held ONLY admin-managed dropdown options and
    // their department mappings — never patient data (patients.diagnosis
    // is a free-text column, not a foreign key into diagnoses.id) — so
    // dropping them is safe and carries zero risk to any patient record.
    // patients.diagnosis/diagnosis_other themselves are NOT touched here;
    // see the Patient interface comment for why those stay.
    db.exec('DROP TABLE IF EXISTS diagnosis_departments');
    db.exec('DROP TABLE IF EXISTS diagnoses');

    // patients pre-dates department/aadhaar_number/mobile_number — unlike
    // every other table here, it can already have rows on an existing
    // install, and SQLite's ADD COLUMN isn't idempotent (re-running it on a
    // column that already exists throws "duplicate column name"), so each
    // one is guarded by an existence check rather than relying on
    // CREATE TABLE IF NOT EXISTS the way everything else in this function
    // does. Every new column is nullable — existing rows get NULL
    // automatically, nothing is backfilled or guessed.
    addColumnIfMissing('patients', 'department', 'TEXT');
    addColumnIfMissing('patients', 'aadhaar_number', 'TEXT');
    addColumnIfMissing('patients', 'mobile_number', 'TEXT');
    addColumnIfMissing('patients', 'registration_time', 'TEXT');
    backfillRegistrationTime();

    seedMasterData();
    removePlaceholderMasterData();
    seedRealDepartmentConsultantMappings();

    isInitialized = true;
    console.log('[Database] Initialization complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Database] Initialization failed:', message);
    throw error;
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    isInitialized = false;
    console.log('[Database] Closed');
  }
}

// Format changed from OPD-YYYY-##### to CR-YYYY-##### per client request.
// Existing OPD- rows are never renamed or touched — this function only
// controls what NEW rows get. To guarantee a new CR- number can never
// collide with (or restart behind) an existing OPD- number for the same
// year, it scans BOTH prefixes and continues from whichever is highest —
// the sequence stays continuous across the format change instead of
// resetting to 1 the moment the prefix changed.
function getNextOpdNumber(): string {
  const today = new Date();
  const year = today.getFullYear();

  const rows = db
    .prepare(`SELECT opd_no FROM patients WHERE opd_no LIKE ? OR opd_no LIKE ?`)
    .all(`OPD-${year}-%`, `CR-${year}-%`) as { opd_no: string }[];

  let maxNumber = 0;
  for (const row of rows) {
    const parts = row.opd_no.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(n) && n > maxNumber) {
      maxNumber = n;
    }
  }

  const paddedNum = String(maxNumber + 1).padStart(5, '0');
  return `CR-${year}-${paddedNum}`;
}

// Read-only preview of the OPD number that would be assigned next.
// Does not reserve or persist anything — reuses the exact same
// generation logic as registerPatient(); the number actually assigned
// at save time is always taken from the real registerPatient() result.
export function previewNextOpdNumber(): string {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  return getNextOpdNumber();
}

export function registerPatient(
  patient: Omit<
    Patient,
    'id' | 'opd_no' | 'registration_time' | 'created_at' | 'updated_at' | 'diagnosis' | 'diagnosis_other'
  >
): Patient {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const opdNo = getNextOpdNumber();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const registrationTime = formatLocalTime(nowDate);

  const stmt = db.prepare(`
    INSERT INTO patients (
      opd_no, registration_date, registration_time, patient_name, age_years, age_months,
      gender, address, aadhaar_number, mobile_number, diagnosis,
      diagnosis_other, department, consultant,
      employee_id, created_at, updated_at, is_deleted, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  // diagnosis is legacy NOT NULL — Registration no longer collects it, so
  // every new row gets '' rather than altering the column's constraint
  // (see the Patient interface comment for why the column itself stays).
  const result = stmt.run(
    opdNo,
    patient.registration_date,
    registrationTime,
    patient.patient_name,
    patient.age_years,
    patient.age_months,
    patient.gender,
    patient.address,
    patient.aadhaar_number || null,
    patient.mobile_number || null,
    '',
    null,
    patient.department || null,
    patient.consultant,
    patient.employee_id,
    now,
    now
  );

  return {
    id: result.lastInsertRowid as number,
    opd_no: opdNo,
    ...patient,
    registration_time: registrationTime,
    created_at: now,
    updated_at: now,
  };
}

export function checkDuplicate(patientName: string, ageYears: number): DuplicateCheckResult {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(`
    SELECT id, opd_no, patient_name, registration_date
    FROM patients
    WHERE patient_name = ? AND age_years = ? AND is_deleted = 0
    LIMIT 1
  `);

  const result = stmt.get(patientName, ageYears) as any;

  if (result) {
    return {
      isDuplicate: true,
      existingPatient: {
        id: result.id,
        opd_no: result.opd_no,
        patient_name: result.patient_name,
        registration_date: result.registration_date,
      },
    };
  }

  return { isDuplicate: false };
}

// includeDeleted defaults to false, preserving Employee's exact existing
// behavior (PatientHistoryScreen never passes it) — only Admin's patient
// screen passes true, to also surface soft-deleted records for restore.
export function searchPatients(query: string, registrationDate?: string, includeDeleted = false): SearchResult[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const conditions = ['(patient_name LIKE ? OR opd_no LIKE ?)'];
  const params: unknown[] = [`%${query}%`, `%${query}%`];

  if (!includeDeleted) {
    conditions.push('is_deleted = 0');
  }

  if (registrationDate) {
    conditions.push('registration_date = ?');
    params.push(registrationDate);
  }

  const stmt = db.prepare(`
    SELECT
      id, opd_no, patient_name, age_years, age_months,
      gender, address, registration_date, registration_time, department, consultant, is_deleted
    FROM patients
    WHERE ${conditions.join(' AND ')}
    ORDER BY registration_date DESC
    LIMIT 50
  `);

  return stmt.all(...params) as SearchResult[];
}

export function getPatient(id: number): Patient | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(`
    SELECT * FROM patients WHERE id = ? AND is_deleted = 0
  `);

  return (stmt.get(id) as Patient | undefined) || null;
}

// Admin-only variant of getPatient — no is_deleted filter, so Admin can
// open a soft-deleted record's detail (e.g. to restore it). Employee's
// db:getPatient channel is untouched and still never returns deleted rows.
export function getPatientAdmin(id: number): Patient | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(`SELECT * FROM patients WHERE id = ?`);
  return (stmt.get(id) as Patient | undefined) || null;
}

export function restorePatient(id: number): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE patients SET is_deleted = 0, updated_at = ?, synced = 0, sync_error = NULL WHERE id = ?`).run(
    now,
    id
  );
}

export function updatePatient(id: number, updates: Partial<Patient>): Patient {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const now = new Date().toISOString();
  const patient = getPatient(id);

  if (!patient) {
    throw new Error(`Patient with id ${id} not found`);
  }

  const updateFields: string[] = [];
  const updateValues: any[] = [];

  // Only allow updates to specific fields. OPD No. is never included here —
  // it stays permanent/system-assigned regardless of who calls this.
  // Employee has no UI that calls updatePatient (Print-only, per the
  // established decision); only Admin's patient-edit screen does, with the
  // full field set below (matches the proposal's "Administrator can unlock
  // for backdating" for registration_date, plus name/age/gender corrections).
  const allowedFields: (keyof Patient)[] = [
    'patient_name',
    'age_years',
    'age_months',
    'gender',
    'registration_date',
    'address',
    'aadhaar_number',
    'mobile_number',
    'department',
    'consultant',
  ];

  for (const field of allowedFields) {
    if (field in updates && updates[field] !== undefined) {
      updateFields.push(`${String(field)} = ?`);
      updateValues.push(updates[field]);
    }
  }

  if (updateFields.length === 0) {
    return patient;
  }

  updateFields.push('updated_at = ?');
  updateValues.push(now);
  // Any local write invalidates whatever the server last confirmed for
  // this row — see the sync section below for how this flag is consumed.
  updateFields.push('synced = 0');
  updateFields.push('sync_error = NULL');
  updateValues.push(id);

  const stmt = db.prepare(`
    UPDATE patients SET ${updateFields.join(', ')} WHERE id = ?
  `);

  stmt.run(...updateValues);

  return getPatient(id) as Patient;
}

export function softDeletePatient(id: number): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE patients SET is_deleted = 1, updated_at = ?, synced = 0, sync_error = NULL WHERE id = ?
  `);

  stmt.run(now, id);
}

// Seeded once, only when the consultants table is empty (fresh install) —
// the original 5-consultant list this hospital used before the
// Department→Consultant structure existed. Left as-is deliberately: these
// names are referenced by real historical patient records, and none of
// them appear in the real Department→Consultant Excel (they predate it),
// so they simply end up mapped to zero departments — unreachable from
// Registration going forward without being deleted or touched.
const SEED_CONSULTANTS = [
  "Dr. Mohd. Ashraf — BUMS",
  "Dr. A. R. Ansari — BUMS, MD (Moalajat)",
  "Dr. S. Fatima — BUMS, MD (Amraz-e-Niswan)",
  "Dr. M. Iqbal — BUMS, MD (Ilaj-bit-Tadbeer)",
  "Dr. K. Rahman — BUMS (General OPD)",
];

function seedMasterData(): void {
  const consultantCount = (db.prepare('SELECT COUNT(*) AS count FROM consultants').get() as { count: number }).count;
  if (consultantCount === 0) {
    const insert = db.prepare('INSERT INTO consultants (name, active, sort_order) VALUES (?, 1, ?)');
    const insertAll = db.transaction((names: string[]) => {
      names.forEach((name, index) => insert.run(name, index));
    });
    insertAll(SEED_CONSULTANTS);
  }
}

// Deliberately obvious fake names used while the real Department →
// Consultant structure was still pending from the client. Now that the
// real data (below) has arrived, these — and any mappings referencing
// them — are removed by exact name on every startup. Idempotent: once
// gone, these DELETEs simply match zero rows on subsequent runs. Any
// patient record that happened to store one of these names as historical
// free text (department/consultant columns aren't foreign keys) is
// completely unaffected — only the master-data catalog rows are removed.
const OBSOLETE_PLACEHOLDER_DEPARTMENTS = ['Department A', 'Department B', 'Department C', 'Department X'];
const OBSOLETE_PLACEHOLDER_CONSULTANTS = ['Doctor X', 'Doctor Y', 'Doctor Z', 'Consultant 1', 'Consultant 2'];

function removePlaceholderMasterData(): void {
  const placeholderDeptIds = db
    .prepare(`SELECT id FROM departments WHERE name IN (${OBSOLETE_PLACEHOLDER_DEPARTMENTS.map(() => '?').join(',')})`)
    .all(...OBSOLETE_PLACEHOLDER_DEPARTMENTS) as { id: number }[];
  const placeholderConsIds = db
    .prepare(`SELECT id FROM consultants WHERE name IN (${OBSOLETE_PLACEHOLDER_CONSULTANTS.map(() => '?').join(',')})`)
    .all(...OBSOLETE_PLACEHOLDER_CONSULTANTS) as { id: number }[];

  for (const { id } of placeholderDeptIds) {
    db.prepare('DELETE FROM department_consultants WHERE department_id = ?').run(id);
  }
  for (const { id } of placeholderConsIds) {
    db.prepare('DELETE FROM department_consultants WHERE consultant_id = ?').run(id);
  }

  if (OBSOLETE_PLACEHOLDER_DEPARTMENTS.length > 0) {
    db.prepare(`DELETE FROM departments WHERE name IN (${OBSOLETE_PLACEHOLDER_DEPARTMENTS.map(() => '?').join(',')})`)
      .run(...OBSOLETE_PLACEHOLDER_DEPARTMENTS);
  }
  if (OBSOLETE_PLACEHOLDER_CONSULTANTS.length > 0) {
    db.prepare(`DELETE FROM consultants WHERE name IN (${OBSOLETE_PLACEHOLDER_CONSULTANTS.map(() => '?').join(',')})`)
      .run(...OBSOLETE_PLACEHOLDER_CONSULTANTS);
  }
}

// Adds one named row to a master-data table if it isn't already there
// (by UNIQUE name), returning its id either way. Idempotent across
// restarts — safe to call every startup. Operates on `db` directly rather
// than through the public addMasterDataItem()/isInitialized-guarded API:
// this runs from initializeDatabase() itself, before isInitialized is set
// to true, the same reason seedMasterData() also bypasses that guard.
function ensureMasterDataRow(table: MasterDataTable, name: string): number {
  const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const maxOrder = (db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table}`).get() as { maxOrder: number | null })
    .maxOrder;
  const nextOrder = (maxOrder ?? -1) + 1;
  const result = db.prepare(`INSERT INTO ${table} (name, active, sort_order) VALUES (?, 1, ?)`).run(name, nextOrder);
  return result.lastInsertRowid as number;
}

// ============================================
// REAL Department -> Consultant data, extracted verbatim from the
// client-provided "Department_Consultant Name.xlsx" (Department Name /
// Consultant Name columns only — no data invented or inferred). Some
// consultants legitimately belong to more than one department (e.g. Dr.
// Sunil Wane, Dr. Heena Kausar), which is exactly why the many-to-many
// department_consultants table is preserved rather than flattened.
// ============================================
const REAL_DEPARTMENTS = [
  'ILMUL JARAHAT (शल्य चिकित्सा)',
  'Amraze Ain, Uzn, Anf wa Halaq (नेत्र, कान, नाक एवं गला रोग)',
  'Moalajat (मेडिसिन)',
  'Amraze Niswan wa Qabalat (प्रसूति एवं स्त्री रोग)',
  'Amraze Jild wa Tazeeniyat (स्किन एवं कॉस्मेटिक)',
  'Tahaffuzi wa Samaji Tib (निवारक एवं सामाजिक चिकित्सा)',
  'Haj Bit Tadbeer (रेजिमिनल थैरेपी)',
  'Amraze Atfal (शिशु रोग)',
  'Dental (दन्त रोग)',
  'Emergency (आपातकालीन चिकित्सा)',
  'Ilmul Samoom (विष विज्ञान)',
  'Screening',
];

const REAL_DEPARTMENT_CONSULTANTS: Record<string, string[]> = {
  'ILMUL JARAHAT (शल्य चिकित्सा)': ['Dr. Rizwan Ullah (M.S.)', 'Dr. Sunil Wane (C.R.)'],
  'Amraze Ain, Uzn, Anf wa Halaq (नेत्र, कान, नाक एवं गला रोग)': [
    'Dr. Irshad Ahmad (M.D.)',
    'Dr. Mohammad Arif (M.D.)',
  ],
  'Moalajat (मेडिसिन)': ['Dr. Kehkashan Jafri (M.D.)', 'Dr. S.M. Abbas Zaidi (M.D.)', 'Dr. Tariq Shaikh (M.D.)'],
  'Amraze Niswan wa Qabalat (प्रसूति एवं स्त्री रोग)': [
    'Dr. (Prof.) S. Nafees Bano (M.D.)',
    'Dr. Shamim Ansari (M.S.)',
    'Dr. Heena Kausar (M.D.)',
    'Dr. Zareena Khatoon (M.D.)',
    'Dr. Arshi Anjum (M.S.)',
  ],
  'Amraze Jild wa Tazeeniyat (स्किन एवं कॉस्मेटिक)': [
    'Dr. (Prof.) Mohd. Anzar Jusain (HOD)',
    'Dr. Dilshad Ali (M.D.)',
    'Dr. Mohammad Rizwan (M.D.)',
    'Dr. Munawwar Gauri (M.D.)',
  ],
  'Tahaffuzi wa Samaji Tib (निवारक एवं सामाजिक चिकित्सा)': ['Dr. Mahfoozur Rahman (M.D.)'],
  'Haj Bit Tadbeer (रेजिमिनल थैरेपी)': [
    'Dr. (Prof.) Mehmooda Begum (M.D.)',
    'Dr. Arif Anees (M.D.)',
    'Dr. Ehsan Ahmad (M.D.)',
    'Dr. Abdul Rehman (M.D.)',
    'Dr. Munawwar Gauri (M.D.)',
  ],
  'Amraze Atfal (शिशु रोग)': ['Dr. Heena Kausar (M.D.)', 'Dr. Zareena Khatoon (M.D.)', 'Dr. Arshi Anjum (M.S.)'],
  'Dental (दन्त रोग)': ['Sr. Sadaf Fatima (B.D.S.)'],
  'Emergency (आपातकालीन चिकित्सा)': ['Dr. Pooja Shrivastava (M.B.B.S.,M.S.)', 'Dr. Sunil Wane (C.R.)'],
  'Ilmul Samoom (विष विज्ञान)': [
    'Dr. (Prof.) Iftekhar Ahmad (M.D.)',
    'Dr. Intezar Ahmad (M.D.)',
    'Dr. Mohd. Naseem Khan (M.D.)',
  ],
  Screening: ['Dr. Asna Zafar (U.M.O.)'],
};

// Idempotent: ensureMasterDataRow() no-ops on names already present, and
// the mapping insert uses INSERT OR IGNORE against the composite primary
// key — safe to run on every startup.
function seedRealDepartmentConsultantMappings(): void {
  const departmentIds = new Map(REAL_DEPARTMENTS.map((name) => [name, ensureMasterDataRow('departments', name)]));
  const consultantNames = Array.from(new Set(Object.values(REAL_DEPARTMENT_CONSULTANTS).flat()));
  const consultantIds = new Map(consultantNames.map((name) => [name, ensureMasterDataRow('consultants', name)]));

  const insertDeptCons = db.prepare(
    'INSERT OR IGNORE INTO department_consultants (department_id, consultant_id) VALUES (?, ?)'
  );
  for (const [departmentName, names] of Object.entries(REAL_DEPARTMENT_CONSULTANTS)) {
    const departmentId = departmentIds.get(departmentName)!;
    for (const consultantName of names) {
      insertDeptCons.run(departmentId, consultantIds.get(consultantName)!);
    }
  }
}

export function getConsultants(): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db.prepare('SELECT name FROM consultants WHERE active = 1 ORDER BY sort_order').all() as { name: string }[];
  return rows.map((r) => r.name);
}

// Flat, active-only department list — used by Registration to populate the
// Department dropdown directly (no longer gated by Diagnosis).
export function getDepartments(): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db.prepare('SELECT name FROM departments WHERE active = 1 ORDER BY sort_order').all() as { name: string }[];
  return rows.map((r) => r.name);
}

// ============================================
// Admin — Consultants & Departments management
// ============================================

export interface MasterDataItem {
  id: number;
  name: string;
  active: boolean;
  sort_order: number;
}

type MasterDataTable = 'consultants' | 'departments';

function listMasterData(table: MasterDataTable): MasterDataItem[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db.prepare(`SELECT id, name, active, sort_order FROM ${table} ORDER BY sort_order`).all() as any[];
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active === 1, sort_order: r.sort_order }));
}

function addMasterDataItem(table: MasterDataTable, name: string): MasterDataItem {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }
  // name is UNIQUE at the schema level (the real, enforced guarantee) — this
  // check exists only so a duplicate reads as a plain "already exists"
  // message instead of the raw SQLite constraint-violation text a hospital
  // admin would otherwise see verbatim in the error banner.
  const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ?`).get(trimmed);
  if (existing) {
    throw new Error(`"${trimmed}" already exists.`);
  }
  const maxOrder = (db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table}`).get() as { maxOrder: number | null }).maxOrder;
  const nextOrder = (maxOrder ?? -1) + 1;
  const result = db
    .prepare(`INSERT INTO ${table} (name, active, sort_order) VALUES (?, 1, ?)`)
    .run(trimmed, nextOrder);
  return { id: result.lastInsertRowid as number, name: trimmed, active: true, sort_order: nextOrder };
}

function updateMasterDataName(table: MasterDataTable, id: number, name: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Name is required');
  }
  const existing = db.prepare(`SELECT id FROM ${table} WHERE name = ? AND id != ?`).get(trimmed, id);
  if (existing) {
    throw new Error(`"${trimmed}" already exists.`);
  }
  db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(trimmed, id);
}

function setMasterDataActive(table: MasterDataTable, id: number, active: boolean): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  db.prepare(`UPDATE ${table} SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}

export const listConsultantsAdmin = () => listMasterData('consultants');
export const addConsultant = (name: string) => addMasterDataItem('consultants', name);
export const updateConsultantName = (id: number, name: string) => updateMasterDataName('consultants', id, name);
export const setConsultantActive = (id: number, active: boolean) => setMasterDataActive('consultants', id, active);

export const listDepartmentsAdmin = () => listMasterData('departments');
export const addDepartment = (name: string) => addMasterDataItem('departments', name);
export const updateDepartmentName = (id: number, name: string) => updateMasterDataName('departments', id, name);
export const setDepartmentActive = (id: number, active: boolean) => setMasterDataActive('departments', id, active);

// ============================================
// Admin — Department → Consultant mappings
// ============================================
//
// Consultant stays free-text on `patients` (see Patient interface) so a
// mapping change here can never corrupt a historical record — this table
// only ever influences what the Registration/Admin dropdown *offers*, the
// same way department/consultant master data already works.

// Consultants mapped to a given department, by name — used by
// Registration and Admin's patient edit to populate the Consultant
// dropdown once a Department is chosen. Active consultants only.
export function getConsultantsForDepartment(departmentName: string): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const department = db.prepare('SELECT id FROM departments WHERE name = ?').get(departmentName) as
    | { id: number }
    | undefined;
  if (!department) return [];
  const rows = db
    .prepare(
      `SELECT c.name AS name FROM consultants c
       JOIN department_consultants dc ON dc.consultant_id = c.id
       WHERE dc.department_id = ? AND c.active = 1
       ORDER BY c.sort_order`
    )
    .all(department.id) as { name: string }[];
  return rows.map((r) => r.name);
}

// Admin-facing: which consultant IDs are currently mapped to a department
// (including inactive consultants, so Admin's checklist can show them).
export function getDepartmentConsultantIds(departmentId: number): number[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db
    .prepare('SELECT consultant_id FROM department_consultants WHERE department_id = ?')
    .all(departmentId) as { consultant_id: number }[];
  return rows.map((r) => r.consultant_id);
}

export function setDepartmentConsultants(departmentId: number, consultantIds: number[]): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const run = db.transaction((ids: number[]) => {
    db.prepare('DELETE FROM department_consultants WHERE department_id = ?').run(departmentId);
    const insert = db.prepare('INSERT INTO department_consultants (department_id, consultant_id) VALUES (?, ?)');
    for (const consultantId of ids) {
      insert.run(departmentId, consultantId);
    }
  });
  run(consultantIds);
}

// ============================================
// Admin — Authentication
// ============================================

const ADMIN_PASSWORD_SETTING_KEY = 'admin_password';
const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function hasAdminPassword(): boolean {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ADMIN_PASSWORD_SETTING_KEY) as
    | { value: string }
    | undefined;
  return !!row;
}

export function setAdminPassword(password: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  const hashed = hashPassword(password);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(ADMIN_PASSWORD_SETTING_KEY, hashed, now);
}

export function verifyAdminPassword(password: string): boolean {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ADMIN_PASSWORD_SETTING_KEY) as
    | { value: string }
    | undefined;
  if (!row) return false;
  return verifyPasswordHash(password, row.value);
}

// Requires the current password to verify successfully before setting the
// new one — never overwrites the password based on new-password input
// alone. Returns false (no change made) if currentPassword is wrong.
export function changeAdminPassword(currentPassword: string, newPassword: string): boolean {
  if (!verifyAdminPassword(currentPassword)) {
    return false;
  }
  setAdminPassword(newPassword);
  return true;
}

// ============================================
// Admin — Password recovery ("Forgot Password?")
// ============================================
//
// One fixed recovery code, the same on every installation, known only to
// the supplier — entering it on the "Forgot Password?" screen lets an
// admin set a brand new password without any database access. Simple by
// deliberate choice: a support-desk fallback for a low-stakes internal
// tool, not a hardened credential. Stored hashed (not as a literal string
// in the compiled app) purely as basic hygiene — this does not change
// what the code actually protects against.
//
// SHA-256 of the recovery code — never the plain code itself, so it isn't
// a literal, searchable string in the built app. To change the code:
// compute a new hash (e.g. `node -e "console.log(require('crypto').createHash('sha256').update('NEWCODE').digest('hex'))"`)
// and replace the constant below.
const RECOVERY_CODE_HASH_HEX = '4a9ca4596692e94f9d2912b06a0d007564a22ee750339a6021c2392149b25d6d';

function verifyRecoveryCode(code: string): boolean {
  const candidate = crypto.createHash('sha256').update(code.trim()).digest();
  const expected = Buffer.from(RECOVERY_CODE_HASH_HEX, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// One combined action, not verify-then-separately-set — there's no window
// where a verified-but-unused code sits around unused. A failed attempt
// leaves the existing password completely untouched.
export function recoverAdminPassword(
  recoveryCode: string,
  newPassword: string
): { success: boolean; error?: string } {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  if (!verifyRecoveryCode(recoveryCode)) {
    return { success: false, error: 'Incorrect recovery code.' };
  }
  try {
    setAdminPassword(newPassword);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
  return { success: true };
}

export interface DashboardStats {
  todayCount: number;
  totalCount: number;
}

// Shared by Employee Dashboard, Admin Dashboard, and CSV export/preview —
// one definition of "what a patient filter means" so all four never drift
// out of sync with each other. Every field is independently optional;
// callers only ever set the subset relevant to them (dashboards never set
// fromDate/toDate, Reports never sets department).
export interface CsvExportFilters {
  fromDate?: string; // YYYY-MM-DD, inclusive — matched against created_at, not
  toDate?: string;   // registration_date (DD/MM/YYYY text isn't range-comparable in SQLite).
  gender?: string;
  department?: string;
  consultant?: string;
  fromTime?: string; // HH:mm (native <input type="time"> value, no seconds) — matched
  toTime?: string;   // against the dedicated registration_time column (HH:mm:ss), inclusive.
}

// Exact-match on each provided field, ANDed together — mirrors how
// Registration writes these columns (plain text, not foreign keys), so a
// filter value from getDepartments()/getConsultants()/getConsultantsForDepartment()
// always matches verbatim.
function buildPatientFilterClause(filters: CsvExportFilters): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.gender) {
    conditions.push('gender = ?');
    params.push(filters.gender);
  }
  if (filters.department) {
    conditions.push('department = ?');
    params.push(filters.department);
  }
  if (filters.consultant) {
    conditions.push('consultant = ?');
    params.push(filters.consultant);
  }
  if (filters.fromDate) {
    conditions.push('substr(created_at, 1, 10) >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push('substr(created_at, 1, 10) <= ?');
    params.push(filters.toDate);
  }
  if (filters.fromTime) {
    // "14:35" >= comparison against "14:35:07" already correctly includes
    // the whole minute onward — a longer string sharing the same prefix
    // lexically sorts after the shorter one, so no padding needed here.
    conditions.push('registration_time >= ?');
    params.push(filters.fromTime);
  }
  if (filters.toTime) {
    // The mirror case DOES need padding: "14:35:07" <= "14:35" is false
    // (same prefix reasoning, in reverse), which would wrongly exclude
    // every second past :00 in the target minute. Padding to ":59" makes
    // "up to 14:35" inclusive of the entire minute, matching fromTime's
    // already-inclusive behavior.
    const toTimeInclusive = filters.toTime.length === 5 ? `${filters.toTime}:59` : filters.toTime;
    conditions.push('registration_time <= ?');
    params.push(toTimeInclusive);
  }

  return { clause: conditions.length ? ` AND ${conditions.join(' AND ')}` : '', params };
}

function getTodayRegistrationDate(): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
}

export function getDashboardStats(filters: CsvExportFilters = {}): DashboardStats {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const { clause, params } = buildPatientFilterClause(filters);

  const todayCount = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM patients WHERE registration_date = ? AND is_deleted = 0${clause}`)
      .get(getTodayRegistrationDate(), ...params) as { count: number }
  ).count;
  const totalCount = (
    db.prepare(`SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0${clause}`).get(...params) as {
      count: number;
    }
  ).count;

  return { todayCount, totalCount };
}

// ============================================
// Backup / Retention
// ============================================

const BACKUP_RETENTION_COUNT = 14;
const BACKUP_FILE_PREFIX = 'opd-backup-';
const BACKUP_FILE_SUFFIX = '.db';

// Manual "Backup Now" snapshots are a deliberately separate lineage from
// the daily backups above — distinct filename prefix, distinct (smaller)
// retention count, pruned independently — so no amount of clicking the
// button can ever shrink the daily lineage's real BACKUP_RETENTION_COUNT
// days of disaster-recovery history. See createManualBackup() below.
const MANUAL_BACKUP_FILE_PREFIX = 'opd-manual-';
const MANUAL_BACKUP_RETENTION_COUNT = 5;
// Clicks closer together than this refresh the same manual snapshot file
// in place instead of creating a new one — guards against a burst of
// accidental double-clicks flooding the (small) manual retention list.
const MANUAL_BACKUP_DEBOUNCE_MS = 30_000;

export interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  lastBackupVerified: boolean;
  retainedCount: number;
  lastError: string | null;
  customLocation: string | null;
  customLocationLastError: string | null;
  customLocationLastSuccessAt: string | null;
}

let lastBackupError: string | null = null;
let lastCustomLocationError: string | null = null;
let lastCustomLocationSuccessAt: string | null = null;

function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

// ============================================
// Backup — admin-chosen additional location
// ============================================
//
// Stored in app_settings (not a separate config file) so it lives
// alongside every other piece of small app configuration, is included in
// every backup automatically, and needs no new file or migration. This
// location is always an ADDITION to the internal folder above, never a
// replacement — see writeToCustomLocationIfConfigured() below.

const BACKUP_LOCATION_SETTING_KEY = 'backup_custom_location';

export function getBackupCustomLocation(): string | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(BACKUP_LOCATION_SETTING_KEY) as
    | { value: string }
    | undefined;
  return row?.value || null;
}

// A real write-permission test, not just fs.existsSync — a network share
// or external drive can exist but have had permissions revoked, so
// existence alone isn't enough to trust before every backup attempt.
export function validateBackupLocation(dirPath: string): { valid: boolean; error?: string } {
  try {
    if (!fs.existsSync(dirPath)) {
      return { valid: false, error: `Folder not found: ${dirPath}` };
    }
    if (!fs.statSync(dirPath).isDirectory()) {
      return { valid: false, error: `Not a folder: ${dirPath}` };
    }
    const testFile = path.join(dirPath, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Folder is not writable: ${message}` };
  }
}

// Only persisted if the folder validates at the moment it's chosen — but
// never cleared automatically afterward if it later becomes unreachable
// (see writeToCustomLocationIfConfigured()): a temporarily unplugged USB
// drive shouldn't require re-choosing the location once it's reconnected.
// Passing null clears the setting (revert to internal-only backups).
export function setBackupCustomLocation(dirPath: string | null): { success: boolean; error?: string } {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  if (dirPath === null) {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(BACKUP_LOCATION_SETTING_KEY);
    return { success: true };
  }
  const validation = validateBackupLocation(dirPath);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? 'Folder is not usable for backups.' };
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(BACKUP_LOCATION_SETTING_KEY, dirPath, now);
  return { success: true };
}

// Best-effort dual-write to the admin-chosen location, called only after
// the internal backup above has already succeeded and been verified.
// Never affects the outcome of that internal backup — failure here is
// tracked separately (customLocationLastError) so it can be reported
// without ever being confused with a real backup failure.
function writeToCustomLocationIfConfigured(sourcePath: string, filename: string): void {
  const customDir = getBackupCustomLocation();
  if (!customDir) return;

  const validation = validateBackupLocation(customDir);
  if (!validation.valid) {
    lastCustomLocationError = validation.error ?? 'Custom backup location unavailable';
    console.error(`[Backup] Custom location unavailable: ${lastCustomLocationError}`);
    return;
  }

  const destPath = path.join(customDir, filename);
  const tmpDest = `${destPath}.tmp`;
  try {
    fs.copyFileSync(sourcePath, tmpDest);
    if (!verifyBackup(tmpDest)) {
      fs.unlinkSync(tmpDest);
      throw new Error('Copied file failed integrity check');
    }
    if (fs.existsSync(destPath)) {
      fs.unlinkSync(destPath);
    }
    fs.renameSync(tmpDest, destPath);
    lastCustomLocationError = null;
    lastCustomLocationSuccessAt = new Date().toISOString();
    console.log(`[Backup] Also written to custom location: ${destPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastCustomLocationError = message;
    console.error(`[Backup] Failed to write to custom location: ${message}`);
    try {
      if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
    } catch {
      // ignore
    }
  }
}

function getTodayFileStamp(): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

function backupFileName(dateStamp: string): string {
  return `${BACKUP_FILE_PREFIX}${dateStamp}${BACKUP_FILE_SUFFIX}`;
}

function listBackupFiles(): string[] {
  const backupDir = getBackupDir();
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_SUFFIX))
    .sort();
}

// Opens the given file read-only and runs PRAGMA integrity_check.
// Never touches the live database — always a separate connection to a
// static file on disk.
export function verifyBackup(filePath: string): boolean {
  let verifyDb: any = null;
  try {
    verifyDb = new Database(filePath, { readonly: true, fileMustExist: true });
    const result = verifyDb.pragma('integrity_check', { simple: true });
    return result === 'ok';
  } catch (error) {
    console.error('[Backup] Verification failed:', error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    if (verifyDb) {
      try {
        verifyDb.close();
      } catch {
        // ignore close errors on a verification-only handle
      }
    }
  }
}

// Removes backups beyond the retention count, oldest first. Filenames
// are YYYY-MM-DD, so a lexical sort is also a chronological sort.
// Pure filesystem operation — never touches the live database.
export function pruneOldBackups(): { removed: string[]; retainedCount: number } {
  const files = listBackupFiles();
  const removed: string[] = [];
  const excess = files.length - BACKUP_RETENTION_COUNT;

  if (excess > 0) {
    const backupDir = getBackupDir();
    const toRemove = files.slice(0, excess);
    for (const f of toRemove) {
      try {
        fs.unlinkSync(path.join(backupDir, f));
        removed.push(f);
      } catch (error) {
        console.error(`[Backup] Failed to remove old backup ${f}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  return { removed, retainedCount: listBackupFiles().length };
}

// Core mechanic shared by the daily backup below and the manual-snapshot
// lineage further down: SQLite's online backup API via better-sqlite3's
// db.backup() — never a raw file copy of the live database — writing to a
// .tmp file, verifying it, and only then atomically renaming it into
// place under whatever final filename the caller specifies. On any
// failure, the live database is untouched and no invalid file is left
// under the final name. Does not touch lastBackupError or any retention
// list — callers own that, since the two lineages track/prune separately.
async function performBackupToFile(finalName: string): Promise<{ success: boolean; file?: string; error?: string }> {
  if (!db || !isInitialized) {
    return { success: false, error: 'Database not initialized' };
  }

  const backupDir = getBackupDir();
  const finalPath = path.join(backupDir, finalName);
  const tmpPath = `${finalPath}.tmp`;

  try {
    await db.backup(tmpPath);

    if (!verifyBackup(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
      const error = 'Backup failed integrity check';
      console.error(`[Backup] ${error}: ${finalName}`);
      return { success: false, error };
    }

    // Windows fs.renameSync throws if the destination already exists
    // (unlike POSIX rename). Both lineages can legitimately re-target the
    // same filename (daily: re-run same day; manual: debounced refresh),
    // so remove any prior file under this exact name first.
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tmpPath, finalPath);

    console.log(`[Backup] Created and verified: ${finalName}`);
    writeToCustomLocationIfConfigured(finalPath, finalName);

    return { success: true, file: finalName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Backup] Failed:', message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    return { success: false, error: message };
  }
}

// Creates (or overwrites) today's daily backup — one file per calendar
// day, retained for BACKUP_RETENTION_COUNT days. This is the app's real
// disaster-recovery safety net; it is only ever called by the automatic
// startup/shutdown triggers and the restore flow's pre-restore safety
// snapshot — never by the manual "Backup Now" button (see
// createManualBackup() below) — specifically so nothing a user clicks can
// ever shrink its retention window.
export async function createBackup(): Promise<{ success: boolean; file?: string; error?: string }> {
  const finalName = backupFileName(getTodayFileStamp());
  const result = await performBackupToFile(finalName);
  if (result.success) {
    lastBackupError = null;
    pruneOldBackups();
  } else {
    lastBackupError = result.error ?? 'Unknown error';
  }
  return result;
}

// ============================================
// Manual "Backup Now" snapshots — separate lineage, see constants above
// ============================================

function manualBackupFileName(timestamp: string): string {
  return `${MANUAL_BACKUP_FILE_PREFIX}${timestamp}${BACKUP_FILE_SUFFIX}`;
}

function getManualBackupTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function listManualBackupFiles(): string[] {
  const backupDir = getBackupDir();
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith(MANUAL_BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_SUFFIX))
    .sort();
}

// Same oldest-first pruning as pruneOldBackups(), against the separate
// manual retention count — never touches daily backup files.
function pruneOldManualBackups(): void {
  const files = listManualBackupFiles();
  const excess = files.length - MANUAL_BACKUP_RETENTION_COUNT;
  if (excess > 0) {
    const backupDir = getBackupDir();
    for (const f of files.slice(0, excess)) {
      try {
        fs.unlinkSync(path.join(backupDir, f));
      } catch (error) {
        console.error(`[Backup] Failed to remove old manual snapshot ${f}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }
}

// The "Backup Now" button. Always produces a fresh, verified snapshot,
// but debounces rapid repeated clicks: if the most recent manual snapshot
// is younger than MANUAL_BACKUP_DEBOUNCE_MS, this refreshes that same
// file in place (`created: false`) rather than adding a new one;
// otherwise it creates a genuinely new, distinctly-timestamped file
// (`created: true`). Deliberately never touches the daily opd-backup-
// lineage or its retention — see createBackup()'s comment above.
export async function createManualBackup(): Promise<{ success: boolean; file?: string; error?: string; created?: boolean }> {
  const files = listManualBackupFiles();
  const mostRecent = files[files.length - 1];

  let targetName: string;
  let created: boolean;

  let ageMs = Infinity;
  if (mostRecent) {
    try {
      ageMs = Date.now() - fs.statSync(path.join(getBackupDir(), mostRecent)).mtime.getTime();
    } catch {
      // file vanished between listing and stat — treat as no recent file
    }
  }

  if (mostRecent && ageMs < MANUAL_BACKUP_DEBOUNCE_MS) {
    targetName = mostRecent;
    created = false;
  } else {
    targetName = manualBackupFileName(getManualBackupTimestamp());
    created = true;
  }

  const result = await performBackupToFile(targetName);
  if (result.success) {
    pruneOldManualBackups();
  }
  return { ...result, created };
}

// Startup path: only backs up if today's backup doesn't already exist.
export async function ensureTodayBackup(): Promise<{ ran: boolean; success: boolean }> {
  const backupDir = getBackupDir();
  const finalPath = path.join(backupDir, backupFileName(getTodayFileStamp()));

  if (fs.existsSync(finalPath)) {
    console.log("[Backup] Today's backup already exists, skipping.");
    return { ran: false, success: verifyBackup(finalPath) };
  }

  const result = await createBackup();
  return { ran: true, success: result.success };
}

export function getBackupStatus(): BackupStatus {
  const files = listBackupFiles();
  const latest = files[files.length - 1] ?? null;

  let lastBackupAt: string | null = null;
  let lastBackupVerified = false;

  if (latest) {
    const backupDir = getBackupDir();
    const latestPath = path.join(backupDir, latest);
    try {
      lastBackupAt = fs.statSync(latestPath).mtime.toISOString();
    } catch {
      // ignore
    }
    lastBackupVerified = verifyBackup(latestPath);
  }

  let customLocation: string | null = null;
  try {
    customLocation = getBackupCustomLocation();
  } catch {
    // not initialized — shouldn't happen here, but never fatal for status display
  }

  return {
    lastBackupAt,
    lastBackupFile: latest,
    lastBackupVerified,
    retainedCount: files.length,
    lastError: lastBackupError,
    customLocation,
    customLocationLastError: lastCustomLocationError,
    customLocationLastSuccessAt: lastCustomLocationSuccessAt,
  };
}

// The internal, always-available backup folder — exported so main.ts's
// "Open Backup Folder" can fall back to it without duplicating this
// path-construction logic.
export function getDefaultBackupLocation(): string {
  return getBackupDir();
}

// Full path to the most recent local (internal-location) backup file, or
// null if none exists yet — used by main.ts to know what to upload.
export function getLatestBackupFilePath(): string | null {
  const files = listBackupFiles();
  const latest = files[files.length - 1];
  if (!latest) return null;
  return path.join(getBackupDir(), latest);
}

// Resolves a filename already shown in the backup history list to its
// full path — used by the restore flow. Deliberately does not accept an
// arbitrary path from the caller.
export function getLocalBackupFilePath(filename: string): string {
  return path.join(getBackupDir(), filename);
}

// Overwrites the live database file with the given source file. The
// caller (main.ts's restore flow) MUST have already verified the
// source's integrity and called closeDatabase() — this function performs
// no safety checks of its own by design, since that sequencing already
// happens immediately before every call site.
export function replaceLiveDatabaseFile(sourcePath: string): void {
  fs.copyFileSync(sourcePath, getDatabasePath());
}

// ============================================
// Cloud backup — device pairing credentials
// ============================================
//
// Stored in app_settings, same as the backup location above. Read/write
// stays here (database.ts already owns all SQLite access); the actual
// HTTP calls that use these credentials live in electron/cloudBackup.ts,
// which imports these two functions rather than touching app_settings
// itself — keeps SQLite access centralized in this one module.

const CLOUD_DEVICE_ID_KEY = 'cloud_device_id';
const CLOUD_API_KEY_KEY = 'cloud_api_key';
// Records which server address these credentials were actually issued
// by — a device ID/API key pair is only meaningful to the one server that
// generated it. Without this, "credentials already exist" and "credentials
// are valid for the server I'm about to talk to" get conflated, which is
// exactly what let a device paired against an old dev server silently
// reuse those credentials against a freshly started LAN server that had
// never heard of it (confirmed via testing: the LAN server's own devices
// table was empty, causing a 401 on every authenticated call).
const CLOUD_PAIRED_API_URL_KEY = 'cloud_paired_api_url';

export function getDeviceCredentials(): { deviceId: string; apiKey: string } | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const deviceIdRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CLOUD_DEVICE_ID_KEY) as
    | { value: string }
    | undefined;
  const apiKeyRow = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CLOUD_API_KEY_KEY) as
    | { value: string }
    | undefined;
  if (!deviceIdRow || !apiKeyRow) return null;
  return { deviceId: deviceIdRow.value, apiKey: apiKeyRow.value };
}

// The server address these currently-stored credentials were paired
// against — null if never recorded (e.g. credentials predate this field)
// or never paired at all. Compared against the currently-configured
// address by ensurePaired() to decide whether cached credentials are
// still usable.
export function getPairedApiUrl(): string | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(CLOUD_PAIRED_API_URL_KEY) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setDeviceCredentials(deviceId: string, apiKey: string, pairedApiUrl: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );
  upsert.run(CLOUD_DEVICE_ID_KEY, deviceId, now);
  upsert.run(CLOUD_API_KEY_KEY, apiKey, now);
  upsert.run(CLOUD_PAIRED_API_URL_KEY, pairedApiUrl, now);
}

// Forgets only this device's pairing identity — used when the configured
// server address no longer matches who these credentials were issued by,
// so the next ensurePaired() call re-pairs from scratch instead of
// sending credentials the new server has never seen. Deliberately narrow:
// touches only the three cloud_* keys above, never patient data, sync
// cursors/timestamps, or backup settings.
export function clearDeviceCredentials(): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const del = db.prepare('DELETE FROM app_settings WHERE key = ?');
  del.run(CLOUD_DEVICE_ID_KEY);
  del.run(CLOUD_API_KEY_KEY);
  del.run(CLOUD_PAIRED_API_URL_KEY);
}

// ============================================
// LAN Sync Server — Admin-managed child process settings
// ============================================
//
// This machine's own preferences for running the LAN server, so the Admin
// app can restore them (auto-start, same port, same identity) on every
// launch without asking again. The setup token here is auto-generated by
// this app the first time LAN Sync is enabled — never typed by a person,
// never shown in any screen — and exists only to let THIS Admin app self-
// pair with the server it just started; every other device pairs via a
// short-lived pairing code instead (see electron/lanServer.ts), never this
// value.

const LAN_SERVER_ENABLED_KEY = 'lan_server_enabled';
const LAN_SERVER_PORT_KEY = 'lan_server_port';
const LAN_SERVER_SETUP_TOKEN_KEY = 'lan_server_setup_token';

function setAppSettingValue(key: string, value: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, now);
}

function getAppSettingValue(key: string): string | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getLanServerEnabled(): boolean {
  return getAppSettingValue(LAN_SERVER_ENABLED_KEY) === '1';
}

export function setLanServerEnabled(enabled: boolean): void {
  setAppSettingValue(LAN_SERVER_ENABLED_KEY, enabled ? '1' : '0');
}

export function getLanServerPort(): number {
  const raw = getAppSettingValue(LAN_SERVER_PORT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4000;
}

export function setLanServerPort(port: number): void {
  setAppSettingValue(LAN_SERVER_PORT_KEY, String(port));
}

// Generated once (first Enable), reused after that — regenerating it on
// every start would be harmless for already-paired devices (their own
// credentials don't depend on it) but would needlessly invalidate the
// dev/manual setupToken fallback path for this install.
export function getOrCreateLanServerSetupToken(): string {
  const existing = getAppSettingValue(LAN_SERVER_SETUP_TOKEN_KEY);
  if (existing) return existing;
  const generated = crypto.randomBytes(24).toString('hex');
  setAppSettingValue(LAN_SERVER_SETUP_TOKEN_KEY, generated);
  return generated;
}

export function getReturningPatientAddress(patientName: string): string | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(`
    SELECT address FROM patients
    WHERE patient_name = ? AND is_deleted = 0
    ORDER BY registration_date DESC
    LIMIT 1
  `);

  const result = stmt.get(patientName) as any;
  return result?.address || null;
}

// ============================================
// Admin — Analytics
// ============================================

export interface AdminAnalytics {
  totalRegistrations: number;
  totalDepartmentsActive: number;
  totalConsultantsActive: number;
  genderCounts: { label: string; count: number }[];
  consultantCounts: { label: string; count: number }[];
  departmentCounts: { label: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
}

// All counts are all-time (never "today") — the Employee Dashboard already
// owns the daily-count concept via getDashboardStats(); this is
// deliberately the total/overall view instead.
//
// totalDepartmentsActive/totalConsultantsActive are deliberately NEVER
// filtered — they're master-data counts (how many departments/consultants
// exist and are active), not registration-derived stats, so a Gender or
// Consultant filter has no meaningful effect on them. Every other field
// here reflects the filtered subset of registrations.
export function getAdminAnalytics(filters: CsvExportFilters = {}): AdminAnalytics {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const { clause, params } = buildPatientFilterClause(filters);

  const totalRegistrations = (
    db.prepare(`SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0${clause}`).get(...params) as {
      count: number;
    }
  ).count;
  const totalDepartmentsActive = (
    db.prepare('SELECT COUNT(*) AS count FROM departments WHERE active = 1').get() as { count: number }
  ).count;
  const totalConsultantsActive = (
    db.prepare('SELECT COUNT(*) AS count FROM consultants WHERE active = 1').get() as { count: number }
  ).count;

  const genderCounts = db
    .prepare(
      `SELECT gender AS label, COUNT(*) AS count FROM patients
       WHERE is_deleted = 0${clause} GROUP BY gender ORDER BY count DESC`
    )
    .all(...params) as { label: string; count: number }[];

  const consultantCounts = db
    .prepare(
      `SELECT consultant AS label, COUNT(*) AS count FROM patients
       WHERE is_deleted = 0${clause} GROUP BY consultant ORDER BY count DESC`
    )
    .all(...params) as { label: string; count: number }[];

  // Excludes patients with no department on record (pre-migration rows, or
  // any row created before a department was ever selected) — a "blank"
  // bucket wouldn't be a meaningful department for this chart.
  const departmentCounts = db
    .prepare(
      `SELECT department AS label, COUNT(*) AS count FROM patients
       WHERE is_deleted = 0 AND department IS NOT NULL AND department != ''${clause}
       GROUP BY department ORDER BY count DESC`
    )
    .all(...params) as { label: string; count: number }[];

  // Keyed off created_at (ISO, e.g. "2026-08-18T10:23:45.123Z") rather than
  // registration_date (DD/MM/YYYY text, not sortable/parseable in SQLite).
  const dailyCounts = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
       FROM patients
       WHERE is_deleted = 0 AND created_at >= datetime('now', '-30 days')${clause}
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; count: number }[];

  return {
    totalRegistrations,
    totalDepartmentsActive,
    totalConsultantsActive,
    genderCounts,
    consultantCounts,
    departmentCounts,
    dailyCounts,
  };
}

// ============================================
// Admin — CSV export
// ============================================

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Excel auto-detects a long all-digit CSV cell (Aadhaar/mobile numbers) as
// a number and renders it in scientific notation (e.g. 1.23457E+11) —
// display corruption only, the underlying database value is untouched.
// The standard fix Excel recognizes is a cell written as a formula that
// evaluates to a text string — ="123456789012" — which Excel displays and
// stores as that literal text, never as a number. Deliberately NOT run
// through csvEscape(): its quotes are load-bearing formula syntax, not
// CSV-escapable content, and Aadhaar/mobile values never contain a comma
// or newline that would need CSV-level quoting anyway.
function excelTextCell(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `="${value.replace(/"/g, '""')}"`;
}

export interface PatientExportRow {
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
  created_at: string;
}

// The single source of rows for both the Reports preview and the CSV
// export below — getReportPreviewRows() and exportPatientsCsv() both call
// this with the exact same filters object, so what the preview shows and
// what the CSV contains can never drift apart. Includes aadhaar_number/
// mobile_number (per explicit customer requirement) even though this is a
// bulk/list-shaped view — unlike the printed slip and the plain patient
// search list, which deliberately still exclude them.
function getFilteredPatientRows(filters: CsvExportFilters): PatientExportRow[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const { clause, params } = buildPatientFilterClause(filters);
  return db
    .prepare(
      `SELECT opd_no, registration_date, registration_time, patient_name, age_years, age_months, gender, address,
              aadhaar_number, mobile_number, department, consultant, employee_id, created_at
       FROM patients
       WHERE is_deleted = 0${clause}
       ORDER BY created_at ASC`
    )
    .all(...params) as PatientExportRow[];
}

// Renderer-facing: same rows the CSV export below writes to disk, for the
// Admin Reports preview table.
export function getReportPreviewRows(filters: CsvExportFilters): PatientExportRow[] {
  return getFilteredPatientRows(filters);
}

const PATIENT_EXPORT_HEADERS = [
  'C.R. No.',
  'Registration Date',
  'Registration Time',
  'Patient Name',
  'Age (Years)',
  'Age (Months)',
  'Gender',
  'Aadhaar Number',
  'Mobile Number',
  'Department',
  'Consultant',
  'Registered By',
  'Created At',
];

function patientExportRowToLine(r: PatientExportRow): string {
  return [
    csvEscape(r.opd_no),
    csvEscape(r.registration_date),
    csvEscape(r.registration_time),
    csvEscape(r.patient_name),
    csvEscape(r.age_years),
    csvEscape(r.age_months),
    csvEscape(r.gender),
    excelTextCell(r.aadhaar_number),
    excelTextCell(r.mobile_number),
    csvEscape(r.department),
    csvEscape(r.consultant),
    csvEscape(r.employee_id),
    csvEscape(r.created_at),
  ].join(',');
}

export function exportPatientsCsv(filters: CsvExportFilters): string {
  const rows = getFilteredPatientRows(filters);
  const lines = [PATIENT_EXPORT_HEADERS.join(','), ...rows.map(patientExportRowToLine)];
  return lines.join('\r\n');
}

// ============================================
// Admin — Consultants CSV export
// ============================================
//
// The Consultants screen has no search/filter — it always shows the full
// list — so this exports exactly that list, in the same order shown on
// screen (sort_order), with the same two columns the table displays.

export function exportConsultantsCsv(): string {
  const items = listConsultantsAdmin();
  const lines = [
    'Name,Status',
    ...items.map((c) => [c.name, c.active ? 'Active' : 'Inactive'].map(csvEscape).join(',')),
  ];
  return lines.join('\r\n');
}

// ============================================
// Admin — Patients list CSV export
// ============================================
//
// Mirrors searchPatients()'s own WHERE clause exactly (same name/OPD/date/
// deleted conditions) so the export always matches what's currently
// filtered on the Admin Patients screen — just without that query's
// LIMIT 50 display cap, since a display cap isn't a deliberate exclusion
// filter the way the search text/date/deleted-toggle are. Includes
// Aadhaar/Mobile (per explicit customer requirement) even though the
// on-screen table itself doesn't show those columns — same as
// exportPatientsCsv above.
export function exportPatientsListCsv(query: string, registrationDate?: string, includeDeleted = false): string {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const conditions = ['(patient_name LIKE ? OR opd_no LIKE ?)'];
  const params: unknown[] = [`%${query}%`, `%${query}%`];

  if (!includeDeleted) {
    conditions.push('is_deleted = 0');
  }
  if (registrationDate) {
    conditions.push('registration_date = ?');
    params.push(registrationDate);
  }

  const rows = db
    .prepare(
      `SELECT opd_no, patient_name, age_years, age_months, gender, aadhaar_number, mobile_number, department,
              registration_date, registration_time, consultant, is_deleted
       FROM patients
       WHERE ${conditions.join(' AND ')}
       ORDER BY registration_date DESC`
    )
    .all(...params) as (SearchResult & {
    aadhaar_number: string | null;
    mobile_number: string | null;
    registration_time: string | null;
    is_deleted: number;
  })[];

  const headers = [
    'C.R. No.',
    'Patient Name',
    'Age (Years)',
    'Age (Months)',
    'Gender',
    'Aadhaar Number',
    'Mobile Number',
    'Department',
    'Registration Date',
    'Registration Time',
    'Consultant',
    'Status',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.opd_no),
        csvEscape(r.patient_name),
        csvEscape(r.age_years),
        csvEscape(r.age_months),
        csvEscape(r.gender),
        excelTextCell(r.aadhaar_number),
        excelTextCell(r.mobile_number),
        csvEscape(r.department),
        csvEscape(r.registration_date),
        csvEscape(r.registration_time),
        csvEscape(r.consultant),
        csvEscape(r.is_deleted ? 'Deleted' : 'Active'),
      ].join(',')
    );
  }
  return lines.join('\r\n');
}

// ============================================
// Admin — Backup history
// ============================================

export interface BackupFileInfo {
  file: string;
  createdAt: string;
  sizeBytes: number;
  verified: boolean;
}

// Newest first. Reuses the same file-listing/verification primitives as
// getBackupStatus(), just returning every retained file instead of only
// the latest.
// Combines both lineages (daily + manual) into one history list. Sorted
// by actual modification time, not filename — the two prefixes
// ("opd-backup-" vs "opd-manual-") don't sort correctly against each
// other lexically, unlike either lineage sorted against itself.
export function listBackups(): BackupFileInfo[] {
  const backupDir = getBackupDir();
  const allFiles = [...listBackupFiles(), ...listManualBackupFiles()];
  return allFiles
    .map((f) => {
      const filePath = path.join(backupDir, f);
      const stat = fs.statSync(filePath);
      return {
        file: f,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        verified: verifyBackup(filePath),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ============================================
// Data Sync — structured operational data (patient records), distinct
// from Backup above (whole-database snapshot files). See electron/sync.ts
// for the HTTP push/pull that consumes these functions, and the
// architecture report for the full Backup-vs-Sync distinction.
//
// `patients.synced` / `last_synced_at` / `sync_error` (already present in
// the schema, previously unused) are sufficient for this design without an
// outbox/change-log table: registerPatient() already sets synced = 0 on
// every insert, and updatePatient()/softDeletePatient()/restorePatient()
// above now do the same on every write. A row's current `synced` value is
// therefore always exactly "does the server have my latest state" — no
// history of intermediate changes needs to be retained, because Reception
// only ever creates/soft-deletes and Admin only ever edits/restores the
// SAME row, never two different in-flight versions of it at once.
// ============================================

function getAppSetting(key: string): string | null {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setAppSetting(key: string, value: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, now);
}

function clearAppSetting(key: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// Oldest-first, bounded — electron/sync.ts pushes in bounded batches (not
// the whole backlog in one request) so one very large first-ever sync
// can't become one unbounded request.
export function getUnsyncedPatients(limit: number): Patient[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  return db.prepare('SELECT * FROM patients WHERE synced = 0 ORDER BY id ASC LIMIT ?').all(limit) as Patient[];
}

export function getSyncPendingCount(): number {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  return (db.prepare('SELECT COUNT(*) AS count FROM patients WHERE synced = 0').get() as { count: number }).count;
}

// Called only after the server has actually acknowledged storing these
// rows (see electron/sync.ts's pushPendingPatients()) — never optimistically
// beforehand, so an interrupted push always leaves the affected rows
// exactly where the next push will find and retry them.
export function markPatientsSynced(ids: number[]): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE patients SET synced = 1, last_synced_at = ?, sync_error = NULL WHERE id = ?');
  const run = db.transaction((rows: number[]) => {
    for (const id of rows) stmt.run(now, id);
  });
  run(ids);
}

// Leaves synced = 0 (so the row is retried on the next push) but records
// why the last attempt was rejected, for the sync status UI.
export function markPatientsSyncFailed(ids: number[], error: string): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  if (ids.length === 0) return;
  const stmt = db.prepare('UPDATE patients SET sync_error = ? WHERE id = ?');
  const run = db.transaction((rows: number[]) => {
    for (const id of rows) stmt.run(error, id);
  });
  run(ids);
}

export interface SyncPatientRow {
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
  created_at: string;
  updated_at: string;
}

// Applies one row pulled from the central server to the local database,
// keyed by opd_no (never id — ids are per-device, opd_no is the one value
// shared across every device's copy of the same patient). Returns which
// of three things happened, purely for pull-summary logging.
//
// A local row with synced = 0 (an edit/soft-delete/restore made here that
// the server hasn't confirmed yet) is deliberately left untouched — an
// incoming pull must never silently discard a pending local change that's
// simply waiting for its own push to go out. The next push carries that
// change to the server; the pull after that is then a genuine no-op here.
export function upsertSyncedPatientFromServer(row: SyncPatientRow): 'inserted' | 'updated' | 'skipped' {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const existing = db.prepare('SELECT id, synced, updated_at FROM patients WHERE opd_no = ?').get(row.opd_no) as
    | { id: number; synced: number; updated_at: string }
    | undefined;

  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO patients (
        opd_no, registration_date, registration_time, patient_name, age_years, age_months,
        gender, address, aadhaar_number, mobile_number, diagnosis,
        diagnosis_other, department, consultant, employee_id,
        created_at, updated_at, is_deleted, synced, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).run(
      row.opd_no,
      row.registration_date,
      row.registration_time,
      row.patient_name,
      row.age_years,
      row.age_months,
      row.gender,
      row.address,
      row.aadhaar_number,
      row.mobile_number,
      row.department,
      row.consultant,
      row.employee_id,
      row.created_at,
      row.updated_at,
      row.is_deleted,
      now
    );
    return 'inserted';
  }

  if (existing.synced === 0) {
    return 'skipped';
  }

  // ISO timestamps (toISOString()) compare correctly as plain strings —
  // fixed-width, zero-padded, always UTC — matching the same comparison
  // the server performs in routes/sync.ts.
  if (row.updated_at <= existing.updated_at) {
    return 'skipped';
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE patients SET
       registration_date = ?, registration_time = ?, patient_name = ?, age_years = ?, age_months = ?,
       gender = ?, address = ?, aadhaar_number = ?, mobile_number = ?,
       department = ?, consultant = ?, is_deleted = ?,
       updated_at = ?, synced = 1, last_synced_at = ?, sync_error = NULL
     WHERE id = ?`
  ).run(
    row.registration_date,
    row.registration_time,
    row.patient_name,
    row.age_years,
    row.age_months,
    row.gender,
    row.address,
    row.aadhaar_number,
    row.mobile_number,
    row.department,
    row.consultant,
    row.is_deleted,
    row.updated_at,
    now,
    existing.id
  );
  return 'updated';
}

const SYNC_PULL_CURSOR_KEY = 'sync_pull_cursor';
const SYNC_LAST_PUSH_AT_KEY = 'sync_last_push_at';
const SYNC_LAST_PUSH_ERROR_KEY = 'sync_last_push_error';
const SYNC_LAST_PULL_AT_KEY = 'sync_last_pull_at';
const SYNC_LAST_PULL_ERROR_KEY = 'sync_last_pull_error';
const SYNC_LAST_PULL_COUNT_KEY = 'sync_last_pull_count';

// Persisted (not just in-memory) so "last successful sync" survives an app
// restart — unlike the cloud-backup status cache, this is explicitly
// required: see the architecture report's restart-safety requirement.
export function getSyncCursor(): string | null {
  return getAppSetting(SYNC_PULL_CURSOR_KEY);
}

export function setSyncCursor(iso: string): void {
  setAppSetting(SYNC_PULL_CURSOR_KEY, iso);
}

export function recordSyncPushResult(success: boolean, error: string | null): void {
  if (success) {
    setAppSetting(SYNC_LAST_PUSH_AT_KEY, new Date().toISOString());
    clearAppSetting(SYNC_LAST_PUSH_ERROR_KEY);
  } else if (error) {
    setAppSetting(SYNC_LAST_PUSH_ERROR_KEY, error);
  }
}

export function recordSyncPullResult(success: boolean, count: number | null, error: string | null): void {
  if (success) {
    setAppSetting(SYNC_LAST_PULL_AT_KEY, new Date().toISOString());
    setAppSetting(SYNC_LAST_PULL_COUNT_KEY, String(count ?? 0));
    clearAppSetting(SYNC_LAST_PULL_ERROR_KEY);
  } else if (error) {
    setAppSetting(SYNC_LAST_PULL_ERROR_KEY, error);
  }
}

export interface SyncStatus {
  lastPushAt: string | null;
  lastPushError: string | null;
  pendingPushCount: number;
  lastPullAt: string | null;
  lastPullError: string | null;
  lastPullCount: number | null;
}

export function getSyncStatus(): SyncStatus {
  const pullCountRaw = getAppSetting(SYNC_LAST_PULL_COUNT_KEY);
  return {
    lastPushAt: getAppSetting(SYNC_LAST_PUSH_AT_KEY),
    lastPushError: getAppSetting(SYNC_LAST_PUSH_ERROR_KEY),
    pendingPushCount: getSyncPendingCount(),
    lastPullAt: getAppSetting(SYNC_LAST_PULL_AT_KEY),
    lastPullError: getAppSetting(SYNC_LAST_PULL_ERROR_KEY),
    lastPullCount: pullCountRaw === null ? null : Number(pullCountRaw),
  };
}
