"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
exports.previewNextOpdNumber = previewNextOpdNumber;
exports.registerPatient = registerPatient;
exports.checkDuplicate = checkDuplicate;
exports.searchPatients = searchPatients;
exports.getPatient = getPatient;
exports.updatePatient = updatePatient;
exports.softDeletePatient = softDeletePatient;
exports.getDiagnoses = getDiagnoses;
exports.getConsultants = getConsultants;
exports.getDashboardStats = getDashboardStats;
exports.verifyBackup = verifyBackup;
exports.pruneOldBackups = pruneOldBackups;
exports.createBackup = createBackup;
exports.ensureTodayBackup = ensureTodayBackup;
exports.getBackupStatus = getBackupStatus;
exports.getReturningPatientAddress = getReturningPatientAddress;
const electron_1 = require("electron");
const node_fs_1 = __importDefault(require("node:fs"));
const path_1 = __importDefault(require("path"));
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
    `);
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
function searchPatients(query, registrationDate) {
    if (!db || !isInitialized) {
        throw new Error('Database not initialized');
    }
    const conditions = ['(patient_name LIKE ? OR opd_no LIKE ?)', 'is_deleted = 0'];
    const params = [`%${query}%`, `%${query}%`];
    if (registrationDate) {
        conditions.push('registration_date = ?');
        params.push(registrationDate);
    }
    const stmt = db.prepare(`
    SELECT
      id, opd_no, patient_name, age_years, age_months,
      gender, address, diagnosis, registration_date, consultant
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
    // Only allow updates to specific fields
    const allowedFields = [
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
function getDiagnoses() {
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
function getConsultants() {
    // Return hardcoded list for now (can be extended to read from database)
    return [
        "Dr. Mohd. Ashraf — BUMS",
        "Dr. A. R. Ansari — BUMS, MD (Moalajat)",
        "Dr. S. Fatima — BUMS, MD (Amraz-e-Niswan)",
        "Dr. M. Iqbal — BUMS, MD (Ilaj-bit-Tadbeer)",
        "Dr. K. Rahman — BUMS (General OPD)",
    ];
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
