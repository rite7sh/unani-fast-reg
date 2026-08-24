export interface PatientData {
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
export interface DashboardStats {
    todayCount: number;
    totalCount: number;
}
export interface BackupStatus {
    lastBackupAt: string | null;
    lastBackupFile: string | null;
    lastBackupVerified: boolean;
    retainedCount: number;
    lastError: string | null;
}
export interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
}
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
export interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    consultant?: string;
    diagnosis?: string;
}
export interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
}
