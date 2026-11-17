export interface PatientData {
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
    customLocation: string | null;
    customLocationLastError: string | null;
    customLocationLastSuccessAt: string | null;
}
export interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
}
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
export interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    department?: string;
    consultant?: string;
    fromTime?: string;
    toTime?: string;
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
export interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
}
export interface BackupLocationInfo {
    location: string | null;
    defaultLocation: string;
}
export interface CloudBackupStatus {
    configured: boolean;
    lastUploadAt: string | null;
    lastUploadFile: string | null;
    lastError: string | null;
}
export interface CloudBackupInfo {
    filename: string;
    sizeBytes: number;
    sha256: string;
    uploadedAt: string;
}
export interface RestoreSource {
    type: "local" | "cloud";
    filename: string;
}
export interface SyncStatus {
    lastPushAt: string | null;
    lastPushError: string | null;
    pendingPushCount: number;
    lastPullAt: string | null;
    lastPullError: string | null;
    lastPullCount: number | null;
}
export interface SyncPushResult {
    success: boolean;
    pushed: number;
    failed: number;
    error?: string;
}
export interface SyncPullResult {
    success: boolean;
    pulled: number;
    error?: string;
}
export interface SyncCycleResult {
    success: boolean;
    push: SyncPushResult;
    pull: SyncPullResult;
}
export interface LanServerStatus {
    enabled: boolean;
    running: boolean;
    port: number | null;
    addresses: string[];
    lastError: string | null;
}
export interface LanAddresses {
    recommended: string | null;
    all: string[];
}
export interface LanPairingCode {
    code: string;
    expiresAt: string;
}
