export {};

declare global {
  interface PatientData {
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
    diagnosis: string;
    registration_date: string;
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
  }

  interface MasterDataItem {
    id: number;
    name: string;
    active: boolean;
    sort_order: number;
  }

  interface AdminAnalytics {
    totalRegistrations: number;
    totalDiagnosesActive: number;
    totalConsultantsActive: number;
    genderCounts: { label: string; count: number }[];
    consultantCounts: { label: string; count: number }[];
    diagnosisCounts: { label: string; count: number }[];
    dailyCounts: { date: string; count: number }[];
  }

  interface CsvExportFilters {
    fromDate?: string;
    toDate?: string;
    gender?: string;
    consultant?: string;
    diagnosis?: string;
  }

  interface BackupFileInfo {
    file: string;
    createdAt: string;
    sizeBytes: number;
    verified: boolean;
  }

  interface AdminAPI {
    hasPassword: () => Promise<boolean>;
    setPassword: (password: string) => Promise<{ success: boolean }>;
    login: (password: string) => Promise<{ success: boolean }>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean }>;
    listDiagnoses: () => Promise<MasterDataItem[]>;
    addDiagnosis: (name: string) => Promise<MasterDataItem>;
    updateDiagnosis: (id: number, name: string) => Promise<{ success: boolean }>;
    setDiagnosisActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
    listConsultants: () => Promise<MasterDataItem[]>;
    addConsultant: (name: string) => Promise<MasterDataItem>;
    updateConsultant: (id: number, name: string) => Promise<{ success: boolean }>;
    setConsultantActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
    listDepartments: () => Promise<MasterDataItem[]>;
    addDepartment: (name: string) => Promise<MasterDataItem>;
    updateDepartment: (id: number, name: string) => Promise<{ success: boolean }>;
    setDepartmentActive: (id: number, active: boolean) => Promise<{ success: boolean }>;
    getDiagnosisDepartments: (diagnosisId: number) => Promise<number[]>;
    setDiagnosisDepartments: (diagnosisId: number, departmentIds: number[]) => Promise<{ success: boolean }>;
    getDepartmentConsultants: (departmentId: number) => Promise<number[]>;
    setDepartmentConsultants: (departmentId: number, consultantIds: number[]) => Promise<{ success: boolean }>;
    getAnalytics: () => Promise<AdminAnalytics>;
    getPatient: (id: number) => Promise<PatientData | null>;
    restorePatient: (id: number) => Promise<{ success: boolean }>;
    exportCsv: (filters: CsvExportFilters) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    createBackupNow: () => Promise<{ success: boolean; file?: string; error?: string }>;
    listBackups: () => Promise<BackupFileInfo[]>;
  }

  interface DatabaseAPI {
    registerPatient: (patient: Omit<PatientData, 'id' | 'opd_no' | 'created_at' | 'updated_at'>) => Promise<PatientData>;
    checkDuplicate: (patientName: string, ageYears: number) => Promise<DuplicateCheckResult>;
    searchPatients: (query: string, registrationDate?: string, includeDeleted?: boolean) => Promise<SearchResult[]>;
    getPatient: (id: number) => Promise<PatientData | null>;
    updatePatient: (id: number, updates: Partial<PatientData>) => Promise<PatientData>;
    softDeletePatient: (id: number) => Promise<{ success: boolean }>;
    getDiagnoses: () => Promise<string[]>;
    getConsultants: () => Promise<string[]>;
    getDepartmentsForDiagnosis: (diagnosisName: string) => Promise<string[]>;
    getConsultantsForDepartment: (departmentName: string) => Promise<string[]>;
    getReturningPatientAddress: (patientName: string) => Promise<string | null>;
    getDashboardStats: () => Promise<DashboardStats>;
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
