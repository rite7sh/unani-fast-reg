import { app } from 'electron';
import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';

const Database = require('better-sqlite3') as any;

export interface Patient {
  id?: number;
  opd_no: string;
  registration_date: string;
  patient_name: string;
  age_years: number;
  age_months: number;
  gender: string;
  address: string;
  aadhaar_number?: string;
  mobile_number?: string;
  diagnosis: string;
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
  diagnosis: string;
  registration_date: string;
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

      CREATE TABLE IF NOT EXISTS diagnoses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS consultants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_diagnoses_active ON diagnoses(active);
      CREATE INDEX IF NOT EXISTS idx_consultants_active ON consultants(active);

      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(active);

      CREATE TABLE IF NOT EXISTS diagnosis_departments (
        diagnosis_id INTEGER NOT NULL REFERENCES diagnoses(id),
        department_id INTEGER NOT NULL REFERENCES departments(id),
        PRIMARY KEY (diagnosis_id, department_id)
      );

      CREATE TABLE IF NOT EXISTS department_consultants (
        department_id INTEGER NOT NULL REFERENCES departments(id),
        consultant_id INTEGER NOT NULL REFERENCES consultants(id),
        PRIMARY KEY (department_id, consultant_id)
      );
    `);

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

    seedMasterData();
    seedPlaceholderDepartmentMappings();

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

function getNextOpdNumber(): string {
  const today = new Date();
  const year = today.getFullYear();
  
  // Get the last OPD number for today's year
  const stmt = db.prepare(`
    SELECT opd_no FROM patients 
    WHERE opd_no LIKE ? 
    ORDER BY id DESC LIMIT 1
  `);
  
  const lastRecord = stmt.get(`OPD-${year}-%`);
  
  let nextNumber = 1;
  if (lastRecord) {
    const parts = (lastRecord.opd_no as string).split('-');
    const lastNum = parseInt(parts[2], 10);
    nextNumber = lastNum + 1;
  }
  
  const paddedNum = String(nextNumber).padStart(5, '0');
  return `OPD-${year}-${paddedNum}`;
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

export function registerPatient(patient: Omit<Patient, 'id' | 'opd_no' | 'created_at' | 'updated_at'>): Patient {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const opdNo = getNextOpdNumber();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO patients (
      opd_no, registration_date, patient_name, age_years, age_months,
      gender, address, aadhaar_number, mobile_number, diagnosis,
      diagnosis_other, department, consultant,
      employee_id, created_at, updated_at, is_deleted, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  const result = stmt.run(
    opdNo,
    patient.registration_date,
    patient.patient_name,
    patient.age_years,
    patient.age_months,
    patient.gender,
    patient.address,
    patient.aadhaar_number || null,
    patient.mobile_number || null,
    patient.diagnosis,
    patient.diagnosis_other || null,
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
      gender, address, diagnosis, registration_date, consultant, is_deleted
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
  db.prepare(`UPDATE patients SET is_deleted = 0, updated_at = ? WHERE id = ?`).run(now, id);
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
    'diagnosis',
    'diagnosis_other',
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
    UPDATE patients SET is_deleted = 1, updated_at = ? WHERE id = ?
  `);

  stmt.run(now, id);
}

// Seeded once, only when the diagnoses/consultants tables are empty (fresh
// install or first run after this migration) — same values, same order as
// the hardcoded lists this replaced, so existing installs see no change in
// their dropdowns. "Other" is intentionally excluded: it's a UI sentinel
// for free-text entry (see RegistrationScreen.tsx), not a manageable
// diagnosis, so it's appended client-side instead of stored here.
const SEED_DIAGNOSES = [
  "Nazla (Coryza)",
  "Zukam (Common Cold)",
  "Suaal (Cough)",
  "Zeequn Nafas (Asthma)",
  "Zaat-ur-Riya (Pneumonia)",
  "Sil (Tuberculosis)",
  "Humma (Fever)",
  "Humma Muhriqa (High Fever)",
  "Humma Diqqiya (Hectic Fever)",
  "Waram (Inflammation)",
  "Waram-e-Halq (Pharyngitis)",
  "Waram-e-Lauzatain (Tonsillitis)",
  "Waram-e-Kabid (Hepatitis)",
  "Waram-e-Kulya (Nephritis)",
  "Waram-e-Masana (Cystitis)",
  "Waja-ul-Mafasil (Arthritis)",
  "Niqras (Gout)",
  "Waja-ul-Zahr (Backache)",
  "Irqun Nasa (Sciatica)",
  "Waja-ur-Raqba (Cervical Pain)",
  "Falij (Paralysis)",
  "Laqwa (Facial Palsy)",
  "Raasha (Tremor)",
  "Sara (Epilepsy)",
  "Suda (Headache)",
  "Shaqiqa (Migraine)",
  "Dawar (Vertigo)",
  "Sahar (Insomnia)",
  "Malikholia (Melancholia)",
  "Bars (Vitiligo)",
  "Bahaq (Tinea Versicolor)",
  "Da-us-Sadaf (Psoriasis)",
  "Quba (Ringworm)",
  "Hikka (Pruritus)",
  "Shara (Urticaria)",
  "Busoor-e-Labaniya (Acne)",
  "Da-us-Salab (Alopecia Areata)",
  "Zof-e-Meda (Dyspepsia)",
  "Qabz (Constipation)",
  "Ishaal (Diarrhoea)",
  "Zaheer (Dysentery)",
  "Qai (Vomiting)",
  "Yarqan (Jaundice)",
  "Istisqa (Ascites)",
  "Bawaseer (Piles)",
  "Sheqaq-e-Maqad (Anal Fissure)",
  "Deedan-e-Ama (Intestinal Worms)",
  "Zayabetus (Diabetes Mellitus)",
  "Zaghtud Dam Qawi (Hypertension)",
  "Zaghtud Dam Zaeef (Hypotension)",
  "Faqrud Dam (Anaemia)",
  "Siman-e-Mufrit (Obesity)",
  "Zof-e-Qalb (Cardiac Weakness)",
  "Hasat-e-Kulya (Renal Calculi)",
  "Salasul Baul (Enuresis)",
  "Ihtebas-e-Baul (Urinary Retention)",
  "Su-e-Haiz (Menstrual Disorder)",
  "Usr-e-Tams (Dysmenorrhoea)",
  "Kasrat-e-Tams (Menorrhagia)",
  "Sailanur Rahm (Leucorrhoea)",
  "Zof-e-Basar (Weak Eyesight)",
  "Ramad (Conjunctivitis)",
  "Waja-ul-Uzn (Earache)",
  "Waja-ul-Asnan (Toothache)",
];

const SEED_CONSULTANTS = [
  "Dr. Mohd. Ashraf — BUMS",
  "Dr. A. R. Ansari — BUMS, MD (Moalajat)",
  "Dr. S. Fatima — BUMS, MD (Amraz-e-Niswan)",
  "Dr. M. Iqbal — BUMS, MD (Ilaj-bit-Tadbeer)",
  "Dr. K. Rahman — BUMS (General OPD)",
];

function seedMasterData(): void {
  const diagnosisCount = (db.prepare('SELECT COUNT(*) AS count FROM diagnoses').get() as { count: number }).count;
  if (diagnosisCount === 0) {
    const insert = db.prepare('INSERT INTO diagnoses (name, active, sort_order) VALUES (?, 1, ?)');
    const insertAll = db.transaction((names: string[]) => {
      names.forEach((name, index) => insert.run(name, index));
    });
    insertAll(SEED_DIAGNOSES);
  }

  const consultantCount = (db.prepare('SELECT COUNT(*) AS count FROM consultants').get() as { count: number }).count;
  if (consultantCount === 0) {
    const insert = db.prepare('INSERT INTO consultants (name, active, sort_order) VALUES (?, 1, ?)');
    const insertAll = db.transaction((names: string[]) => {
      names.forEach((name, index) => insert.run(name, index));
    });
    insertAll(SEED_CONSULTANTS);
  }
}

// ============================================
// PLACEHOLDER TEST DATA — Diagnosis → Department → Consultant chain
// ============================================
//
// The real hospital's department structure and diagnosis/consultant
// mappings were not available when this feature was built (see project
// history). These names are deliberately obvious fakes ("Diagnosis 1",
// "Department A", "Doctor X", ...) so they can never be mistaken for real
// data, and are added ON TOP of the existing real SEED_DIAGNOSES /
// SEED_CONSULTANTS lists — nothing real is replaced or touched.
//
// To remove/replace once real data arrives: delete these rows (and their
// mappings) via the Admin > Diagnoses / Departments / Consultants screens,
// or directly from the diagnoses/consultants/departments/
// diagnosis_departments/department_consultants tables — no code or schema
// change is required either way, since this is ordinary master-data rows,
// not anything hardcoded into the application.
const PLACEHOLDER_DIAGNOSES = ['Diagnosis 1', 'Diagnosis 2', 'Diagnosis 3'];
const PLACEHOLDER_DEPARTMENTS = ['Department A', 'Department B', 'Department C', 'Department X'];
const PLACEHOLDER_CONSULTANTS = ['Doctor X', 'Doctor Y', 'Doctor Z', 'Consultant 1', 'Consultant 2'];

const PLACEHOLDER_DIAGNOSIS_DEPARTMENTS: Record<string, string[]> = {
  'Diagnosis 1': ['Department A', 'Department B'],
  'Diagnosis 2': ['Department B', 'Department C'],
  'Diagnosis 3': ['Department X'],
};

const PLACEHOLDER_DEPARTMENT_CONSULTANTS: Record<string, string[]> = {
  'Department A': ['Doctor X', 'Consultant 1'],
  'Department B': ['Doctor Y'],
  'Department C': ['Doctor Z', 'Consultant 2'],
  'Department X': ['Consultant 1'],
};

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

function seedPlaceholderDepartmentMappings(): void {
  const diagnosisIds = new Map(PLACEHOLDER_DIAGNOSES.map((name) => [name, ensureMasterDataRow('diagnoses', name)]));
  const departmentIds = new Map(
    PLACEHOLDER_DEPARTMENTS.map((name) => [name, ensureMasterDataRow('departments', name)])
  );
  const consultantIds = new Map(
    PLACEHOLDER_CONSULTANTS.map((name) => [name, ensureMasterDataRow('consultants', name)])
  );

  const insertDiagDept = db.prepare(
    'INSERT OR IGNORE INTO diagnosis_departments (diagnosis_id, department_id) VALUES (?, ?)'
  );
  for (const [diagnosisName, departmentNames] of Object.entries(PLACEHOLDER_DIAGNOSIS_DEPARTMENTS)) {
    const diagnosisId = diagnosisIds.get(diagnosisName)!;
    for (const departmentName of departmentNames) {
      insertDiagDept.run(diagnosisId, departmentIds.get(departmentName)!);
    }
  }

  const insertDeptCons = db.prepare(
    'INSERT OR IGNORE INTO department_consultants (department_id, consultant_id) VALUES (?, ?)'
  );
  for (const [departmentName, consultantNames] of Object.entries(PLACEHOLDER_DEPARTMENT_CONSULTANTS)) {
    const departmentId = departmentIds.get(departmentName)!;
    for (const consultantName of consultantNames) {
      insertDeptCons.run(departmentId, consultantIds.get(consultantName)!);
    }
  }
}

export function getDiagnoses(): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db.prepare('SELECT name FROM diagnoses WHERE active = 1 ORDER BY sort_order').all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function getConsultants(): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db.prepare('SELECT name FROM consultants WHERE active = 1 ORDER BY sort_order').all() as { name: string }[];
  return rows.map((r) => r.name);
}

// ============================================
// Admin — Diagnoses & Consultants management
// ============================================

export interface MasterDataItem {
  id: number;
  name: string;
  active: boolean;
  sort_order: number;
}

type MasterDataTable = 'diagnoses' | 'consultants' | 'departments';

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
  db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(trimmed, id);
}

function setMasterDataActive(table: MasterDataTable, id: number, active: boolean): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  db.prepare(`UPDATE ${table} SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}

export const listDiagnosesAdmin = () => listMasterData('diagnoses');
export const addDiagnosis = (name: string) => addMasterDataItem('diagnoses', name);
export const updateDiagnosisName = (id: number, name: string) => updateMasterDataName('diagnoses', id, name);
export const setDiagnosisActive = (id: number, active: boolean) => setMasterDataActive('diagnoses', id, active);

export const listConsultantsAdmin = () => listMasterData('consultants');
export const addConsultant = (name: string) => addMasterDataItem('consultants', name);
export const updateConsultantName = (id: number, name: string) => updateMasterDataName('consultants', id, name);
export const setConsultantActive = (id: number, active: boolean) => setMasterDataActive('consultants', id, active);

export const listDepartmentsAdmin = () => listMasterData('departments');
export const addDepartment = (name: string) => addMasterDataItem('departments', name);
export const updateDepartmentName = (id: number, name: string) => updateMasterDataName('departments', id, name);
export const setDepartmentActive = (id: number, active: boolean) => setMasterDataActive('departments', id, active);

// ============================================
// Admin — Diagnosis → Department → Consultant mappings
// ============================================
//
// Both diagnosis and consultant stay free-text on `patients` (see Patient
// interface) so a mapping change here can never corrupt a historical
// record — these tables only ever influence what the Registration/Admin
// dropdowns *offer*, the same way diagnoses/consultants already work.

// Departments mapped to a given diagnosis, by name — used by Registration
// and Admin's patient edit to populate the Department dropdown once a
// Diagnosis is chosen. Active departments only, in sort_order.
export function getDepartmentsForDiagnosis(diagnosisName: string): string[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const diagnosis = db.prepare('SELECT id FROM diagnoses WHERE name = ?').get(diagnosisName) as
    | { id: number }
    | undefined;
  if (!diagnosis) return [];
  const rows = db
    .prepare(
      `SELECT d.name AS name FROM departments d
       JOIN diagnosis_departments dd ON dd.department_id = d.id
       WHERE dd.diagnosis_id = ? AND d.active = 1
       ORDER BY d.sort_order`
    )
    .all(diagnosis.id) as { name: string }[];
  return rows.map((r) => r.name);
}

// Consultants mapped to a given department, by name — same role as
// getDepartmentsForDiagnosis, one level down the chain.
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

// Admin-facing: which department IDs are currently mapped to a diagnosis
// (including inactive departments, so Admin's checklist can show them).
export function getDiagnosisDepartmentIds(diagnosisId: number): number[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const rows = db
    .prepare('SELECT department_id FROM diagnosis_departments WHERE diagnosis_id = ?')
    .all(diagnosisId) as { department_id: number }[];
  return rows.map((r) => r.department_id);
}

// Replaces the full set of departments mapped to a diagnosis in one
// transaction (delete-then-reinsert) — Admin's checklist always submits
// the complete desired set, never an incremental add/remove.
export function setDiagnosisDepartments(diagnosisId: number, departmentIds: number[]): void {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }
  const run = db.transaction((ids: number[]) => {
    db.prepare('DELETE FROM diagnosis_departments WHERE diagnosis_id = ?').run(diagnosisId);
    const insert = db.prepare('INSERT INTO diagnosis_departments (diagnosis_id, department_id) VALUES (?, ?)');
    for (const departmentId of ids) {
      insert.run(diagnosisId, departmentId);
    }
  });
  run(departmentIds);
}

// Admin-facing equivalent of getDiagnosisDepartmentIds, one level down.
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

export interface DashboardStats {
  todayCount: number;
  totalCount: number;
}

function getTodayRegistrationDate(): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
}

export function getDashboardStats(): DashboardStats {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const todayStmt = db.prepare(`
    SELECT COUNT(*) AS count FROM patients WHERE registration_date = ? AND is_deleted = 0
  `);
  const totalStmt = db.prepare(`
    SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0
  `);

  const todayCount = (todayStmt.get(getTodayRegistrationDate()) as { count: number }).count;
  const totalCount = (totalStmt.get() as { count: number }).count;

  return { todayCount, totalCount };
}

// ============================================
// Backup / Retention
// ============================================

const BACKUP_RETENTION_COUNT = 14;
const BACKUP_FILE_PREFIX = 'opd-backup-';
const BACKUP_FILE_SUFFIX = '.db';

export interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupFile: string | null;
  lastBackupVerified: boolean;
  retainedCount: number;
  lastError: string | null;
}

let lastBackupError: string | null = null;

function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
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

// Creates (or overwrites) today's backup using SQLite's online backup API
// via better-sqlite3's db.backup() — never a raw file copy of the live
// database. Writes to a .tmp file, verifies it, and only then atomically
// renames it into place. On any failure, the live database is untouched
// and no invalid file is left under the final name.
export async function createBackup(): Promise<{ success: boolean; file?: string; error?: string }> {
  if (!db || !isInitialized) {
    const error = 'Database not initialized';
    lastBackupError = error;
    return { success: false, error };
  }

  const backupDir = getBackupDir();
  const dateStamp = getTodayFileStamp();
  const finalName = backupFileName(dateStamp);
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
      lastBackupError = error;
      return { success: false, error };
    }

    // Windows fs.renameSync throws if the destination already exists
    // (unlike POSIX rename). createBackup() is safely re-callable within
    // the same day, so remove any prior same-day file first.
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath);
    }
    fs.renameSync(tmpPath, finalPath);

    pruneOldBackups();

    lastBackupError = null;
    console.log(`[Backup] Created and verified: ${finalName}`);
    return { success: true, file: finalName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Backup] Failed:', message);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    lastBackupError = message;
    return { success: false, error: message };
  }
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

  return {
    lastBackupAt,
    lastBackupFile: latest,
    lastBackupVerified,
    retainedCount: files.length,
    lastError: lastBackupError,
  };
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
  totalDiagnosesActive: number;
  totalConsultantsActive: number;
  genderCounts: { label: string; count: number }[];
  consultantCounts: { label: string; count: number }[];
  diagnosisCounts: { label: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
}

// All counts are all-time (never "today") — the Employee Dashboard already
// owns the daily-count concept via getDashboardStats(); this is
// deliberately the total/overall view instead.
export function getAdminAnalytics(): AdminAnalytics {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const totalRegistrations = (
    db.prepare('SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0').get() as { count: number }
  ).count;
  const totalDiagnosesActive = (
    db.prepare('SELECT COUNT(*) AS count FROM diagnoses WHERE active = 1').get() as { count: number }
  ).count;
  const totalConsultantsActive = (
    db.prepare('SELECT COUNT(*) AS count FROM consultants WHERE active = 1').get() as { count: number }
  ).count;

  const genderCounts = (
    db
      .prepare(
        `SELECT gender AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY gender ORDER BY count DESC`
      )
      .all() as { label: string; count: number }[]
  );

  const consultantCounts = (
    db
      .prepare(
        `SELECT consultant AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY consultant ORDER BY count DESC`
      )
      .all() as { label: string; count: number }[]
  );

  const diagnosisCounts = (
    db
      .prepare(
        `SELECT diagnosis AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY diagnosis ORDER BY count DESC LIMIT 10`
      )
      .all() as { label: string; count: number }[]
  );

  // Keyed off created_at (ISO, e.g. "2026-08-18T10:23:45.123Z") rather than
  // registration_date (DD/MM/YYYY text, not sortable/parseable in SQLite).
  const dailyCounts = (
    db
      .prepare(
        `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
         FROM patients
         WHERE is_deleted = 0 AND created_at >= datetime('now', '-30 days')
         GROUP BY date
         ORDER BY date ASC`
      )
      .all() as { date: string; count: number }[]
  );

  return {
    totalRegistrations,
    totalDiagnosesActive,
    totalConsultantsActive,
    genderCounts,
    consultantCounts,
    diagnosisCounts,
    dailyCounts,
  };
}

// ============================================
// Admin — CSV export
// ============================================

export interface CsvExportFilters {
  fromDate?: string; // YYYY-MM-DD, inclusive — matched against created_at, not
  toDate?: string;   // registration_date (DD/MM/YYYY text isn't range-comparable in SQLite).
  gender?: string;
  consultant?: string;
  diagnosis?: string;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportPatientsCsv(filters: CsvExportFilters): string {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const conditions = ['is_deleted = 0'];
  const params: unknown[] = [];

  if (filters.fromDate) {
    conditions.push('substr(created_at, 1, 10) >= ?');
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    conditions.push('substr(created_at, 1, 10) <= ?');
    params.push(filters.toDate);
  }
  if (filters.gender) {
    conditions.push('gender = ?');
    params.push(filters.gender);
  }
  if (filters.consultant) {
    conditions.push('consultant = ?');
    params.push(filters.consultant);
  }
  if (filters.diagnosis) {
    conditions.push('diagnosis = ?');
    params.push(filters.diagnosis);
  }

  const rows = db
    .prepare(
      `SELECT opd_no, registration_date, patient_name, age_years, age_months, gender, address,
              diagnosis, diagnosis_other, consultant, employee_id, created_at
       FROM patients
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC`
    )
    .all(...params) as any[];

  const headers = [
    'OPD No.',
    'Registration Date',
    'Patient Name',
    'Age (Years)',
    'Age (Months)',
    'Gender',
    'Address',
    'Diagnosis',
    'Diagnosis (Other)',
    'Consultant',
    'Registered By',
    'Created At',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.opd_no,
        r.registration_date,
        r.patient_name,
        r.age_years,
        r.age_months,
        r.gender,
        r.address,
        r.diagnosis,
        r.diagnosis_other,
        r.consultant,
        r.employee_id,
        r.created_at,
      ]
        .map(csvEscape)
        .join(',')
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
export function listBackups(): BackupFileInfo[] {
  const backupDir = getBackupDir();
  return listBackupFiles()
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
    .reverse();
}
