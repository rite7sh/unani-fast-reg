"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setConsultantActive = exports.updateConsultantName = exports.addConsultant = exports.listConsultantsAdmin = exports.setDiagnosisActive = exports.updateDiagnosisName = exports.addDiagnosis = exports.listDiagnosesAdmin = void 0;
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
exports.previewNextOpdNumber = previewNextOpdNumber;
exports.registerPatient = registerPatient;
exports.checkDuplicate = checkDuplicate;
exports.searchPatients = searchPatients;
exports.getPatient = getPatient;
exports.getPatientAdmin = getPatientAdmin;
exports.restorePatient = restorePatient;
exports.updatePatient = updatePatient;
exports.softDeletePatient = softDeletePatient;
exports.getDiagnoses = getDiagnoses;
exports.getConsultants = getConsultants;
exports.hasAdminPassword = hasAdminPassword;
exports.setAdminPassword = setAdminPassword;
exports.verifyAdminPassword = verifyAdminPassword;
exports.changeAdminPassword = changeAdminPassword;
exports.getDashboardStats = getDashboardStats;
exports.verifyBackup = verifyBackup;
exports.pruneOldBackups = pruneOldBackups;
exports.createBackup = createBackup;
exports.ensureTodayBackup = ensureTodayBackup;
exports.getBackupStatus = getBackupStatus;
exports.getReturningPatientAddress = getReturningPatientAddress;
exports.getAdminAnalytics = getAdminAnalytics;
exports.exportPatientsCsv = exportPatientsCsv;
exports.listBackups = listBackups;
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const Database = require('better-sqlite3');
let db = null;
let isInitialized = false;
function getDatabasePath() {
    const userDataPath = electron_1.app.getPath('userData');
    const dataDir = path_1.default.join(userDataPath, 'data');
    // Ensure data directory exists
    if (!node_fs_1.default.existsSync(dataDir)) {
        node_fs_1.default.mkdirSync(dataDir, { recursive: true });
    }
    return path_1.default.join(dataDir, 'opd.db');
}
function initializeDatabase() {
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
    `);
        seedMasterData();
        isInitialized = true;
        console.log('[Database] Initialization complete');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Database] Initialization failed:', message);
        throw error;
    }
}
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        isInitialized = false;
        console.log('[Database] Closed');
    }
}
function getNextOpdNumber() {
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
        const parts = lastRecord.opd_no.split('-');
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
function previewNextOpdNumber() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    return getNextOpdNumber();
}
function registerPatient(patient) {
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
    const result = stmt.run(opdNo, patient.registration_date, patient.patient_name, patient.age_years, patient.age_months, patient.gender, patient.address, patient.diagnosis, patient.diagnosis_other || null, patient.consultant, patient.employee_id, now, now);
    return {
        id: result.lastInsertRowid,
        opd_no: opdNo,
        ...patient,
        created_at: now,
        updated_at: now,
    };
}
function checkDuplicate(patientName, ageYears) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const stmt = db.prepare(`
    SELECT id, opd_no, patient_name, registration_date
    FROM patients
    WHERE patient_name = ? AND age_years = ? AND is_deleted = 0
    LIMIT 1
  `);
    const result = stmt.get(patientName, ageYears);
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
function searchPatients(query, registrationDate, includeDeleted = false) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const conditions = ['(patient_name LIKE ? OR opd_no LIKE ?)'];
    const params = [`%${query}%`, `%${query}%`];
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
    return stmt.all(...params);
}
function getPatient(id) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const stmt = db.prepare(`
    SELECT * FROM patients WHERE id = ? AND is_deleted = 0
  `);
    return stmt.get(id) || null;
}
// Admin-only variant of getPatient — no is_deleted filter, so Admin can
// open a soft-deleted record's detail (e.g. to restore it). Employee's
// db:getPatient channel is untouched and still never returns deleted rows.
function getPatientAdmin(id) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const stmt = db.prepare(`SELECT * FROM patients WHERE id = ?`);
    return stmt.get(id) || null;
}
function restorePatient(id) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const now = new Date().toISOString();
    db.prepare(`UPDATE patients SET is_deleted = 0, updated_at = ? WHERE id = ?`).run(now, id);
}
function updatePatient(id, updates) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const now = new Date().toISOString();
    const patient = getPatient(id);
    if (!patient) {
        throw new Error(`Patient with id ${id} not found`);
    }
    const updateFields = [];
    const updateValues = [];
    // Only allow updates to specific fields. OPD No. is never included here —
    // it stays permanent/system-assigned regardless of who calls this.
    // Employee has no UI that calls updatePatient (Print-only, per the
    // established decision); only Admin's patient-edit screen does, with the
    // full field set below (matches the proposal's "Administrator can unlock
    // for backdating" for registration_date, plus name/age/gender corrections).
    const allowedFields = [
        'patient_name',
        'age_years',
        'age_months',
        'gender',
        'registration_date',
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
    return getPatient(id);
}
function softDeletePatient(id) {
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
function seedMasterData() {
    const diagnosisCount = db.prepare('SELECT COUNT(*) AS count FROM diagnoses').get().count;
    if (diagnosisCount === 0) {
        const insert = db.prepare('INSERT INTO diagnoses (name, active, sort_order) VALUES (?, 1, ?)');
        const insertAll = db.transaction((names) => {
            names.forEach((name, index) => insert.run(name, index));
        });
        insertAll(SEED_DIAGNOSES);
    }
    const consultantCount = db.prepare('SELECT COUNT(*) AS count FROM consultants').get().count;
    if (consultantCount === 0) {
        const insert = db.prepare('INSERT INTO consultants (name, active, sort_order) VALUES (?, 1, ?)');
        const insertAll = db.transaction((names) => {
            names.forEach((name, index) => insert.run(name, index));
        });
        insertAll(SEED_CONSULTANTS);
    }
}
function getDiagnoses() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const rows = db.prepare('SELECT name FROM diagnoses WHERE active = 1 ORDER BY sort_order').all();
    return rows.map((r) => r.name);
}
function getConsultants() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const rows = db.prepare('SELECT name FROM consultants WHERE active = 1 ORDER BY sort_order').all();
    return rows.map((r) => r.name);
}
function listMasterData(table) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const rows = db.prepare(`SELECT id, name, active, sort_order FROM ${table} ORDER BY sort_order`).all();
    return rows.map((r) => ({ id: r.id, name: r.name, active: r.active === 1, sort_order: r.sort_order }));
}
function addMasterDataItem(table, name) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('Name is required');
    }
    const maxOrder = db.prepare(`SELECT MAX(sort_order) AS maxOrder FROM ${table}`).get().maxOrder;
    const nextOrder = (maxOrder ?? -1) + 1;
    const result = db
        .prepare(`INSERT INTO ${table} (name, active, sort_order) VALUES (?, 1, ?)`)
        .run(trimmed, nextOrder);
    return { id: result.lastInsertRowid, name: trimmed, active: true, sort_order: nextOrder };
}
function updateMasterDataName(table, id, name) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('Name is required');
    }
    db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(trimmed, id);
}
function setMasterDataActive(table, id, active) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    db.prepare(`UPDATE ${table} SET active = ? WHERE id = ?`).run(active ? 1 : 0, id);
}
const listDiagnosesAdmin = () => listMasterData('diagnoses');
exports.listDiagnosesAdmin = listDiagnosesAdmin;
const addDiagnosis = (name) => addMasterDataItem('diagnoses', name);
exports.addDiagnosis = addDiagnosis;
const updateDiagnosisName = (id, name) => updateMasterDataName('diagnoses', id, name);
exports.updateDiagnosisName = updateDiagnosisName;
const setDiagnosisActive = (id, active) => setMasterDataActive('diagnoses', id, active);
exports.setDiagnosisActive = setDiagnosisActive;
const listConsultantsAdmin = () => listMasterData('consultants');
exports.listConsultantsAdmin = listConsultantsAdmin;
const addConsultant = (name) => addMasterDataItem('consultants', name);
exports.addConsultant = addConsultant;
const updateConsultantName = (id, name) => updateMasterDataName('consultants', id, name);
exports.updateConsultantName = updateConsultantName;
const setConsultantActive = (id, active) => setMasterDataActive('consultants', id, active);
exports.setConsultantActive = setConsultantActive;
// ============================================
// Admin — Authentication
// ============================================
const ADMIN_PASSWORD_SETTING_KEY = 'admin_password';
const SCRYPT_KEYLEN = 64;
function hashPassword(password) {
    const salt = node_crypto_1.default.randomBytes(16).toString('hex');
    const hash = node_crypto_1.default.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPasswordHash(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash)
        return false;
    const candidate = node_crypto_1.default.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    if (candidate.length !== expected.length)
        return false;
    return node_crypto_1.default.timingSafeEqual(candidate, expected);
}
function hasAdminPassword() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ADMIN_PASSWORD_SETTING_KEY);
    return !!row;
}
function setAdminPassword(password) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters');
    }
    const hashed = hashPassword(password);
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(ADMIN_PASSWORD_SETTING_KEY, hashed, now);
}
function verifyAdminPassword(password) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(ADMIN_PASSWORD_SETTING_KEY);
    if (!row)
        return false;
    return verifyPasswordHash(password, row.value);
}
// Requires the current password to verify successfully before setting the
// new one — never overwrites the password based on new-password input
// alone. Returns false (no change made) if currentPassword is wrong.
function changeAdminPassword(currentPassword, newPassword) {
    if (!verifyAdminPassword(currentPassword)) {
        return false;
    }
    setAdminPassword(newPassword);
    return true;
}
function getTodayRegistrationDate() {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
}
function getDashboardStats() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const todayStmt = db.prepare(`
    SELECT COUNT(*) AS count FROM patients WHERE registration_date = ? AND is_deleted = 0
  `);
    const totalStmt = db.prepare(`
    SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0
  `);
    const todayCount = todayStmt.get(getTodayRegistrationDate()).count;
    const totalCount = totalStmt.get().count;
    return { todayCount, totalCount };
}
// ============================================
// Backup / Retention
// ============================================
const BACKUP_RETENTION_COUNT = 14;
const BACKUP_FILE_PREFIX = 'opd-backup-';
const BACKUP_FILE_SUFFIX = '.db';
let lastBackupError = null;
function getBackupDir() {
    const userDataPath = electron_1.app.getPath('userData');
    const backupDir = path_1.default.join(userDataPath, 'data', 'backups');
    if (!node_fs_1.default.existsSync(backupDir)) {
        node_fs_1.default.mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
}
function getTodayFileStamp() {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
function backupFileName(dateStamp) {
    return `${BACKUP_FILE_PREFIX}${dateStamp}${BACKUP_FILE_SUFFIX}`;
}
function listBackupFiles() {
    const backupDir = getBackupDir();
    return node_fs_1.default
        .readdirSync(backupDir)
        .filter((f) => f.startsWith(BACKUP_FILE_PREFIX) && f.endsWith(BACKUP_FILE_SUFFIX))
        .sort();
}
// Opens the given file read-only and runs PRAGMA integrity_check.
// Never touches the live database — always a separate connection to a
// static file on disk.
function verifyBackup(filePath) {
    let verifyDb = null;
    try {
        verifyDb = new Database(filePath, { readonly: true, fileMustExist: true });
        const result = verifyDb.pragma('integrity_check', { simple: true });
        return result === 'ok';
    }
    catch (error) {
        console.error('[Backup] Verification failed:', error instanceof Error ? error.message : String(error));
        return false;
    }
    finally {
        if (verifyDb) {
            try {
                verifyDb.close();
            }
            catch {
                // ignore close errors on a verification-only handle
            }
        }
    }
}
// Removes backups beyond the retention count, oldest first. Filenames
// are YYYY-MM-DD, so a lexical sort is also a chronological sort.
// Pure filesystem operation — never touches the live database.
function pruneOldBackups() {
    const files = listBackupFiles();
    const removed = [];
    const excess = files.length - BACKUP_RETENTION_COUNT;
    if (excess > 0) {
        const backupDir = getBackupDir();
        const toRemove = files.slice(0, excess);
        for (const f of toRemove) {
            try {
                node_fs_1.default.unlinkSync(path_1.default.join(backupDir, f));
                removed.push(f);
            }
            catch (error) {
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
async function createBackup() {
    if (!db || !isInitialized) {
        const error = 'Database not initialized';
        lastBackupError = error;
        return { success: false, error };
    }
    const backupDir = getBackupDir();
    const dateStamp = getTodayFileStamp();
    const finalName = backupFileName(dateStamp);
    const finalPath = path_1.default.join(backupDir, finalName);
    const tmpPath = `${finalPath}.tmp`;
    try {
        await db.backup(tmpPath);
        if (!verifyBackup(tmpPath)) {
            try {
                node_fs_1.default.unlinkSync(tmpPath);
            }
            catch {
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
        if (node_fs_1.default.existsSync(finalPath)) {
            node_fs_1.default.unlinkSync(finalPath);
        }
        node_fs_1.default.renameSync(tmpPath, finalPath);
        pruneOldBackups();
        lastBackupError = null;
        console.log(`[Backup] Created and verified: ${finalName}`);
        return { success: true, file: finalName };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Backup] Failed:', message);
        try {
            if (node_fs_1.default.existsSync(tmpPath))
                node_fs_1.default.unlinkSync(tmpPath);
        }
        catch {
            // ignore
        }
        lastBackupError = message;
        return { success: false, error: message };
    }
}
// Startup path: only backs up if today's backup doesn't already exist.
async function ensureTodayBackup() {
    const backupDir = getBackupDir();
    const finalPath = path_1.default.join(backupDir, backupFileName(getTodayFileStamp()));
    if (node_fs_1.default.existsSync(finalPath)) {
        console.log("[Backup] Today's backup already exists, skipping.");
        return { ran: false, success: verifyBackup(finalPath) };
    }
    const result = await createBackup();
    return { ran: true, success: result.success };
}
function getBackupStatus() {
    const files = listBackupFiles();
    const latest = files[files.length - 1] ?? null;
    let lastBackupAt = null;
    let lastBackupVerified = false;
    if (latest) {
        const backupDir = getBackupDir();
        const latestPath = path_1.default.join(backupDir, latest);
        try {
            lastBackupAt = node_fs_1.default.statSync(latestPath).mtime.toISOString();
        }
        catch {
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
function getReturningPatientAddress(patientName) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const stmt = db.prepare(`
    SELECT address FROM patients
    WHERE patient_name = ? AND is_deleted = 0
    ORDER BY registration_date DESC
    LIMIT 1
  `);
    const result = stmt.get(patientName);
    return result?.address || null;
}
// All counts are all-time (never "today") — the Employee Dashboard already
// owns the daily-count concept via getDashboardStats(); this is
// deliberately the total/overall view instead.
function getAdminAnalytics() {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const totalRegistrations = db.prepare('SELECT COUNT(*) AS count FROM patients WHERE is_deleted = 0').get().count;
    const totalDiagnosesActive = db.prepare('SELECT COUNT(*) AS count FROM diagnoses WHERE active = 1').get().count;
    const totalConsultantsActive = db.prepare('SELECT COUNT(*) AS count FROM consultants WHERE active = 1').get().count;
    const genderCounts = db
        .prepare(`SELECT gender AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY gender ORDER BY count DESC`)
        .all();
    const consultantCounts = db
        .prepare(`SELECT consultant AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY consultant ORDER BY count DESC`)
        .all();
    const diagnosisCounts = db
        .prepare(`SELECT diagnosis AS label, COUNT(*) AS count FROM patients
         WHERE is_deleted = 0 GROUP BY diagnosis ORDER BY count DESC LIMIT 10`)
        .all();
    // Keyed off created_at (ISO, e.g. "2026-08-18T10:23:45.123Z") rather than
    // registration_date (DD/MM/YYYY text, not sortable/parseable in SQLite).
    const dailyCounts = db
        .prepare(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
         FROM patients
         WHERE is_deleted = 0 AND created_at >= datetime('now', '-30 days')
         GROUP BY date
         ORDER BY date ASC`)
        .all();
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
function csvEscape(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportPatientsCsv(filters) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const conditions = ['is_deleted = 0'];
    const params = [];
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
        .prepare(`SELECT opd_no, registration_date, patient_name, age_years, age_months, gender, address,
              diagnosis, diagnosis_other, consultant, employee_id, created_at
       FROM patients
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at ASC`)
        .all(...params);
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
        lines.push([
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
            .join(','));
    }
    return lines.join('\r\n');
}
// Newest first. Reuses the same file-listing/verification primitives as
// getBackupStatus(), just returning every retained file instead of only
// the latest.
function listBackups() {
    const backupDir = getBackupDir();
    return listBackupFiles()
        .map((f) => {
        const filePath = path_1.default.join(backupDir, f);
        const stat = node_fs_1.default.statSync(filePath);
        return {
            file: f,
            createdAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
            verified: verifyBackup(filePath),
        };
    })
        .reverse();
}
