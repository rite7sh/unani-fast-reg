import { app } from 'electron';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'path';

const require = createRequire(import.meta.url);
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
  diagnosis: string;
  diagnosis_other?: string;
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
    `);

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

export function registerPatient(patient: Omit<Patient, 'id' | 'opd_no' | 'created_at' | 'updated_at'>): Patient {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const opdNo = getNextOpdNumber();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO patients (
      opd_no, registration_date, patient_name, age_years, age_months,
      gender, address, diagnosis, diagnosis_other, consultant,
      employee_id, created_at, updated_at, is_deleted, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  const result = stmt.run(
    opdNo,
    patient.registration_date,
    patient.patient_name,
    patient.age_years,
    patient.age_months,
    patient.gender,
    patient.address,
    patient.diagnosis,
    patient.diagnosis_other || null,
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

export function searchPatients(query: string): SearchResult[] {
  if (!db || !isInitialized) {
    throw new Error('Database not initialized');
  }

  const stmt = db.prepare(`
    SELECT 
      id, opd_no, patient_name, age_years, age_months,
      gender, address, diagnosis, registration_date, consultant
    FROM patients
    WHERE (patient_name LIKE ? OR opd_no LIKE ?)
      AND is_deleted = 0
    ORDER BY registration_date DESC
    LIMIT 50
  `);

  const searchPattern = `%${query}%`;
  return stmt.all(searchPattern, searchPattern) as SearchResult[];
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

  // Only allow updates to specific fields
  const allowedFields: (keyof Patient)[] = [
    'address',
    'diagnosis',
    'diagnosis_other',
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

export function getDiagnoses(): string[] {
  // Return hardcoded list for now (can be extended to read from database)
  return [
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
    "Other",
  ];
}

export function getConsultants(): string[] {
  // Return hardcoded list for now (can be extended to read from database)
  return [
    "Dr. Mohd. Ashraf — BUMS",
    "Dr. A. R. Ansari — BUMS, MD (Moalajat)",
    "Dr. S. Fatima — BUMS, MD (Amraz-e-Niswan)",
    "Dr. M. Iqbal — BUMS, MD (Ilaj-bit-Tadbeer)",
    "Dr. K. Rahman — BUMS (General OPD)",
  ];
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
