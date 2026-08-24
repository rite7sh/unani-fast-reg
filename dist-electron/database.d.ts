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
export declare function initializeDatabase(): void;
export declare function closeDatabase(): void;
export declare function previewNextOpdNumber(): string;
export declare function registerPatient(patient: Omit<Patient, 'id' | 'opd_no' | 'created_at' | 'updated_at'>): Patient;
export declare function checkDuplicate(patientName: string, ageYears: number): DuplicateCheckResult;
export declare function searchPatients(query: string, registrationDate?: string, includeDeleted?: boolean): SearchResult[];
export declare function getPatient(id: number): Patient | null;
export declare function getPatientAdmin(id: number): Patient | null;
export declare function restorePatient(id: number): void;
export declare function updatePatient(id: number, updates: Partial<Patient>): Patient;
export declare function softDeletePatient(id: number): void;
export declare function getDiagnoses(): string[];
export declare function getConsultants(): string[];
export interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
}
export declare const listDiagnosesAdmin: () => MasterDataItem[];
export declare const addDiagnosis: (name: string) => MasterDataItem;
export declare const updateDiagnosisName: (id: number, name: string) => void;
export declare const setDiagnosisActive: (id: number, active: boolean) => void;
export declare const listConsultantsAdmin: () => MasterDataItem[];
export declare const addConsultant: (name: string) => MasterDataItem;
export declare const updateConsultantName: (id: number, name: string) => void;
export declare const setConsultantActive: (id: number, active: boolean) => void;
export declare const listDepartmentsAdmin: () => MasterDataItem[];
export declare const addDepartment: (name: string) => MasterDataItem;
export declare const updateDepartmentName: (id: number, name: string) => void;
export declare const setDepartmentActive: (id: number, active: boolean) => void;
export declare function getDepartmentsForDiagnosis(diagnosisName: string): string[];
export declare function getConsultantsForDepartment(departmentName: string): string[];
export declare function getDiagnosisDepartmentIds(diagnosisId: number): number[];
export declare function setDiagnosisDepartments(diagnosisId: number, departmentIds: number[]): void;
export declare function getDepartmentConsultantIds(departmentId: number): number[];
export declare function setDepartmentConsultants(departmentId: number, consultantIds: number[]): void;
export declare function hasAdminPassword(): boolean;
export declare function setAdminPassword(password: string): void;
export declare function verifyAdminPassword(password: string): boolean;
export declare function changeAdminPassword(currentPassword: string, newPassword: string): boolean;
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
export interface AdminAnalytics {
    totalRegistrations: number;
    totalDiagnosesActive: number;
    totalConsultantsActive: number;
    genderCounts: {
        label: string;
        count: number;
    }[];
    consultantCounts: {
        label: string;
        count: number;
    }[];
    diagnosisCounts: {
        label: string;
        count: number;
    }[];
    dailyCounts: {
        date: string;
        count: number;
    }[];
}
export declare function getAdminAnalytics(): AdminAnalytics;
export interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    consultant?: string;
    diagnosis?: string;
}
export declare function exportPatientsCsv(filters: CsvExportFilters): string;
export interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
}
export declare function listBackups(): BackupFileInfo[];
