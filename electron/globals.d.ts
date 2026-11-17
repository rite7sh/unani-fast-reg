export {};

declare global {
  interface PatientData {
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
    // Legacy — Diagnosis was removed as a concept; see electron/database.ts.
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

  interface DuplicateCheckResult {
    isDuplicate: boolean;
    existingPatient?: {
      id: number;
      opd_no: string;
      patient_name: string;
      registration_date: string;
    };
  }

  interface SearchResult {
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

  interface DashboardStats {
    todayCount: number;
    totalCount: number;
  }

  interface BackupStatus {
    lastBackupAt: string | null;
    lastBackupFile: string | null;
    lastBackupVerified: boolean;
    retainedCount: number;
    lastError: string | null;
    customLocation: string | null;
    customLocationLastError: string | null;
    customLocationLastSuccessAt: string | null;
  }

  interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
  }

  interface AdminAnalytics {
    totalRegistrations: number;
    totalDepartmentsActive: number;
    totalConsultantsActive: number;
    genderCounts: { label: string; count: number }[];
    consultantCounts: { label: string; count: number }[];
    departmentCounts: { label: string; count: number }[];
    dailyCounts: { date: string; count: number }[];
  }

  interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    department?: string;
    consultant?: string;
    fromTime?: string;
    toTime?: string;
  }

  interface PatientExportRow {
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

  interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
  }

  interface BackupLocationInfo {
    location: string | null;
    defaultLocation: string;
  }

  interface CloudBackupStatus {
    configured: boolean;
    lastUploadAt: string | null;
    lastUploadFile: string | null;
    lastError: string | null;
  }

  interface CloudBackupInfo {
    filename: string;
    sizeBytes: number;
    sha256: string;
    uploadedAt: string;
  }

  interface RestoreSource {
    type: 'local' | 'cloud';
    filename: string;
  }

  interface SyncStatus {
    lastPushAt: string | null;
    lastPushError: string | null;
    pendingPushCount: number;
    lastPullAt: string | null;
    lastPullError: string | null;
    lastPullCount: number | null;
  }

  interface SyncPushResult {
    success: boolean;
    pushed: number;
    failed: number;
    error?: string;
  }

  interface SyncPullResult {
    success: boolean;
    pulled: number;
    error?: string;
  }

  interface SyncCycleResult {
    success: boolean;
    push: SyncPushResult;
    pull: SyncPullResult;
  }

  interface LanServerStatus {
    enabled: boolean;
    running: boolean;
    port: number | null;
    addresses: string[];
    lastError: string | null;
  }

  interface LanAddresses {
    recommended: string | null;
    all: string[];
  }

  interface LanPairingCode {
    code: string;
    expiresAt: string;
  }

  interface SyncAPI {
    syncNow: () => Promise<SyncCycleResult>;
    getStatus: () => Promise<SyncStatus>;
    connectToHospitalServer: (address: string, pairingCode: string) => Promise<{ success: boolean; error?: string }>;
  }

  interface AdminAPI {
    hasPassword: () => Promise<boolean>;
    setPassword: (password: string) => Promise<{ success: boolean }>;
    login: (password: string) => Promise<{ success: boolean }>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean }>;
    recoverPassword: (recoveryCode: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
    listConsultants: () => Promise<MasterDataItem[]>;
    addConsultant: (name: string) => Promise<MasterDataItem>;
    updateConsultant: (id: number, name: string) => Promise<{ success: boolean }>;
    setConsultantActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
    listDepartments: () => Promise<MasterDataItem[]>;
    addDepartment: (name: string) => Promise<MasterDataItem>;
    updateDepartment: (id: number, name: string) => Promise<{ success: boolean }>;
    setDepartmentActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
    getDepartmentConsultants: (departmentId: number) => Promise<number[]>;
    setDepartmentConsultants: (departmentId: number, consultantIds: number[]) => Promise<{ success: boolean }>;
    getAnalytics: (filters?: CsvExportFilters) => Promise<AdminAnalytics>;
    getPatient: (id: number) => Promise<PatientData | null>;
    restorePatient: (id: number) => Promise<{ success: boolean }>;
    exportCsv: (filters: CsvExportFilters) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    getReportPreview: (filters: CsvExportFilters) => Promise<PatientExportRow[]>;
    exportConsultantsCsv: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    exportPatientsListCsv: (
      query: string,
      registrationDate?: string,
      includeDeleted?: boolean
    ) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    createBackupNow: () => Promise<{ success: boolean; file?: string; error?: string; created?: boolean }>;
    listBackups: () => Promise<BackupFileInfo[]>;
    getBackupLocation: () => Promise<BackupLocationInfo>;
    chooseBackupLocation: () => Promise<{ success: boolean; canceled?: boolean; error?: string; location: string | null }>;
    clearBackupLocation: () => Promise<{ success: boolean }>;
    openBackupFolder: () => Promise<{ success: boolean; error?: string }>;
    getCloudBackupStatus: () => Promise<CloudBackupStatus>;
    listCloudBackups: () => Promise<CloudBackupInfo[]>;
    uploadBackupNow: () => Promise<{ success: boolean; error?: string; status?: string }>;
    restoreBackup: (source: RestoreSource) => Promise<{ success: boolean; error?: string }>;
    getLanServerStatus: () => Promise<LanServerStatus>;
    startLanServer: () => Promise<LanServerStatus>;
    stopLanServer: () => Promise<LanServerStatus>;
    restartLanServer: () => Promise<LanServerStatus>;
    getLanAddresses: () => Promise<LanAddresses>;
    generateLanPairingCode: () => Promise<LanPairingCode>;
    setLanServerPort: (port: number) => Promise<{ success: boolean }>;
  }

  interface DatabaseAPI {
    registerPatient: (
      patient: Omit<PatientData, 'id' | 'opd_no' | 'registration_time' | 'created_at' | 'updated_at'>
    ) => Promise<PatientData>;
    checkDuplicate: (patientName: string, ageYears: number) => Promise<DuplicateCheckResult>;
    searchPatients: (query: string, registrationDate?: string, includeDeleted?: boolean) => Promise<SearchResult[]>;
    getPatient: (id: number) => Promise<PatientData | null>;
    updatePatient: (id: number, updates: Partial<PatientData>) => Promise<PatientData>;
    getConsultants: () => Promise<string[]>;
    getDepartments: () => Promise<string[]>;
    getConsultantsForDepartment: (departmentName: string) => Promise<string[]>;
    getReturningPatientAddress: (patientName: string) => Promise<string | null>;
    getDashboardStats: (filters?: CsvExportFilters) => Promise<DashboardStats>;
    previewNextOpdNumber: () => Promise<string>;
    getBackupStatus: () => Promise<BackupStatus>;
  }

  interface ElectronAPI {
    versions: {
      node: () => string;
      electron: () => string;
      app: () => string;
    };
    health: {
      ping: () => string;
    };
    db: DatabaseAPI;
    admin: AdminAPI;
    sync: SyncAPI;
    ipc: {
      send: (channel: string, data?: unknown) => void;
      receive: (channel: string, callback: (data: unknown) => void) => void;
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      removeListener: (channel: string) => void;
    };
  }

  interface Window {
    electron: ElectronAPI;
  }
}
