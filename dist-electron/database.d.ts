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
export declare function initializeDatabase(): void;
export declare function closeDatabase(): void;
export declare function previewNextOpdNumber(): string;
export declare function registerPatient(patient: Omit<Patient, 'id' | 'opd_no' | 'created_at' | 'updated_at'>): Patient;
export declare function checkDuplicate(patientName: string, ageYears: number): DuplicateCheckResult;
export declare function searchPatients(query: string, registrationDate?: string): SearchResult[];
export declare function getPatient(id: number): Patient | null;
export declare function updatePatient(id: number, updates: Partial<Patient>): Patient;
export declare function softDeletePatient(id: number): void;
export declare function getDiagnoses(): string[];
export declare function getConsultants(): string[];
export interface DashboardStats {
    todayCount: number;
    totalCount: number;
}
export declare function getDashboardStats(): DashboardStats;
export interface BackupStatus {
    lastBackupAt: string | null;
    lastBackupFile: string | null;
    lastBackupVerified: boolean;
    retainedCount: number;
    lastError: string | null;
}
export declare function verifyBackup(filePath: string): boolean;
export declare function pruneOldBackups(): {
    removed: string[];
    retainedCount: number;
};
export declare function createBackup(): Promise<{
    success: boolean;
    file?: string;
    error?: string;
}>;
export declare function ensureTodayBackup(): Promise<{
    ran: boolean;
    success: boolean;
}>;
export declare function getBackupStatus(): BackupStatus;
export declare function getReturningPatientAddress(patientName: string): string | null;
