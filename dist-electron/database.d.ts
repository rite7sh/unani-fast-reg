export interface Patient {
    id?: number;
    opd_no: string;
    registration_date: string;
    registration_time?: string | null;
    patient_name: string;
    age_years: number;
    age_months: number;
    gender: string;
    address: string;
    aadhaar_number?: string;
    mobile_number?: string;
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
export declare function initializeDatabase(): void;
export declare function closeDatabase(): void;
export declare function previewNextOpdNumber(): string;
export declare function registerPatient(patient: Omit<Patient, 'id' | 'opd_no' | 'registration_time' | 'created_at' | 'updated_at' | 'diagnosis' | 'diagnosis_other'>): Patient;
export declare function checkDuplicate(patientName: string, ageYears: number): DuplicateCheckResult;
export declare function searchPatients(query: string, registrationDate?: string, includeDeleted?: boolean): SearchResult[];
export declare function getPatient(id: number): Patient | null;
export declare function getPatientAdmin(id: number): Patient | null;
export declare function restorePatient(id: number): void;
export declare function updatePatient(id: number, updates: Partial<Patient>): Patient;
export declare function softDeletePatient(id: number): void;
export declare function getConsultants(): string[];
export declare function getDepartments(): string[];
export interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
}
export declare const listConsultantsAdmin: () => MasterDataItem[];
export declare const addConsultant: (name: string) => MasterDataItem;
export declare const updateConsultantName: (id: number, name: string) => void;
export declare const setConsultantActive: (id: number, active: boolean) => void;
export declare const listDepartmentsAdmin: () => MasterDataItem[];
export declare const addDepartment: (name: string) => MasterDataItem;
export declare const updateDepartmentName: (id: number, name: string) => void;
export declare const setDepartmentActive: (id: number, active: boolean) => void;
export declare function getConsultantsForDepartment(departmentName: string): string[];
export declare function getDepartmentConsultantIds(departmentId: number): number[];
export declare function setDepartmentConsultants(departmentId: number, consultantIds: number[]): void;
export declare function hasAdminPassword(): boolean;
export declare function setAdminPassword(password: string): void;
export declare function verifyAdminPassword(password: string): boolean;
export declare function changeAdminPassword(currentPassword: string, newPassword: string): boolean;
export declare function recoverAdminPassword(recoveryCode: string, newPassword: string): {
    success: boolean;
    error?: string;
};
export interface DashboardStats {
    todayCount: number;
    totalCount: number;
}
export interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    department?: string;
    consultant?: string;
    fromTime?: string;
    toTime?: string;
}
export declare function getDashboardStats(filters?: CsvExportFilters): DashboardStats;
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
export declare function getBackupCustomLocation(): string | null;
export declare function validateBackupLocation(dirPath: string): {
    valid: boolean;
    error?: string;
};
export declare function setBackupCustomLocation(dirPath: string | null): {
    success: boolean;
    error?: string;
};
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
export declare function createManualBackup(): Promise<{
    success: boolean;
    file?: string;
    error?: string;
    created?: boolean;
}>;
export declare function ensureTodayBackup(): Promise<{
    ran: boolean;
    success: boolean;
}>;
export declare function getBackupStatus(): BackupStatus;
export declare function getDefaultBackupLocation(): string;
export declare function getLatestBackupFilePath(): string | null;
export declare function getLocalBackupFilePath(filename: string): string;
export declare function replaceLiveDatabaseFile(sourcePath: string): void;
export declare function getDeviceCredentials(): {
    deviceId: string;
    apiKey: string;
} | null;
export declare function getPairedApiUrl(): string | null;
export declare function setDeviceCredentials(deviceId: string, apiKey: string, pairedApiUrl: string): void;
export declare function clearDeviceCredentials(): void;
export declare function getLanServerEnabled(): boolean;
export declare function setLanServerEnabled(enabled: boolean): void;
export declare function getLanServerPort(): number;
export declare function setLanServerPort(port: number): void;
export declare function getOrCreateLanServerSetupToken(): string;
export declare function getReturningPatientAddress(patientName: string): string | null;
export interface AdminAnalytics {
    totalRegistrations: number;
    totalDepartmentsActive: number;
    totalConsultantsActive: number;
    genderCounts: {
        label: string;
        count: number;
    }[];
    consultantCounts: {
        label: string;
        count: number;
    }[];
    departmentCounts: {
        label: string;
        count: number;
    }[];
    dailyCounts: {
        date: string;
        count: number;
    }[];
}
export declare function getAdminAnalytics(filters?: CsvExportFilters): AdminAnalytics;
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
export declare function getReportPreviewRows(filters: CsvExportFilters): PatientExportRow[];
export declare function exportPatientsCsv(filters: CsvExportFilters): string;
export declare function exportConsultantsCsv(): string;
export declare function exportPatientsListCsv(query: string, registrationDate?: string, includeDeleted?: boolean): string;
export interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
}
export declare function listBackups(): BackupFileInfo[];
export declare function getUnsyncedPatients(limit: number): Patient[];
export declare function getSyncPendingCount(): number;
export declare function markPatientsSynced(ids: number[]): void;
export declare function markPatientsSyncFailed(ids: number[], error: string): void;
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
export declare function upsertSyncedPatientFromServer(row: SyncPatientRow): 'inserted' | 'updated' | 'skipped';
export declare function getSyncCursor(): string | null;
export declare function setSyncCursor(iso: string): void;
export declare function recordSyncPushResult(success: boolean, error: string | null): void;
export declare function recordSyncPullResult(success: boolean, count: number | null, error: string | null): void;
export interface SyncStatus {
    lastPushAt: string | null;
    lastPushError: string | null;
    pendingPushCount: number;
    lastPullAt: string | null;
    lastPullError: string | null;
    lastPullCount: number | null;
}
export declare function getSyncStatus(): SyncStatus;
