import { contextBridge, ipcRenderer } from 'electron';

// Type for database operations
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
  genderCounts: { label: string; count: number }[];
  consultantCounts: { label: string; count: number }[];
  departmentCounts: { label: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
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

// Secure context bridge - only expose what's necessary
contextBridge.exposeInMainWorld('electron', {
  // Version information for testing
  versions: {
    node: () => process.versions.node,
    electron: () => process.versions.electron,
    app: () => process.versions.app,
  },

  // Minimal health check API
  health: {
    ping: () => 'pong',
  },

  // Database API
  db: {
    registerPatient: async (
      patient: Omit<PatientData, 'id' | 'opd_no' | 'registration_time' | 'created_at' | 'updated_at'>
    ) => {
      return ipcRenderer.invoke('db:registerPatient', patient);
    },
    checkDuplicate: async (patientName: string, ageYears: number) => {
      return ipcRenderer.invoke('db:checkDuplicate', patientName, ageYears);
    },
    searchPatients: async (query: string, registrationDate?: string, includeDeleted?: boolean) => {
      return ipcRenderer.invoke('db:searchPatients', query, registrationDate, includeDeleted);
    },
    getPatient: async (id: number) => {
      return ipcRenderer.invoke('db:getPatient', id);
    },
    updatePatient: async (id: number, updates: Partial<PatientData>) => {
      return ipcRenderer.invoke('db:updatePatient', id, updates);
    },
    // No softDeletePatient here — deliberate; see main.ts's comment above
    // the (removed) db:softDeletePatient handler for why.
    getConsultants: async () => {
      return ipcRenderer.invoke('db:getConsultants');
    },
    getDepartments: async () => {
      return ipcRenderer.invoke('db:getDepartments');
    },
    getConsultantsForDepartment: async (departmentName: string) => {
      return ipcRenderer.invoke('db:getConsultantsForDepartment', departmentName);
    },
    getReturningPatientAddress: async (patientName: string) => {
      return ipcRenderer.invoke('db:getReturningPatientAddress', patientName);
    },
    getDashboardStats: async (filters?: CsvExportFilters): Promise<DashboardStats> => {
      return ipcRenderer.invoke('db:getDashboardStats', filters);
    },
    previewNextOpdNumber: async (): Promise<string> => {
      return ipcRenderer.invoke('db:previewNextOpdNumber');
    },
    getBackupStatus: async (): Promise<BackupStatus> => {
      return ipcRenderer.invoke('db:getBackupStatus');
    },
  },

  // Admin API — auth + master-data management. Only ever called from
  // Admin screens, which only render after a successful admin login; see
  // src/main.tsx. Not a hardened per-call session/token system — this
  // remains a single trusted local renderer (contextIsolation/sandbox/
  // nodeIntegration unchanged), matching the existing Employee login's
  // trust model.
  admin: {
    hasPassword: async (): Promise<boolean> => {
      return ipcRenderer.invoke('admin:hasPassword');
    },
    setPassword: async (password: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setPassword', password);
    },
    login: async (password: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:login', password);
    },
    changePassword: async (currentPassword: string, newPassword: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:changePassword', currentPassword, newPassword);
    },
    recoverPassword: async (
      recoveryCode: string,
      newPassword: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('admin:recoverPassword', recoveryCode, newPassword);
    },
    listConsultants: async (): Promise<MasterDataItem[]> => {
      return ipcRenderer.invoke('admin:listConsultants');
    },
    addConsultant: async (name: string): Promise<MasterDataItem> => {
      return ipcRenderer.invoke('admin:addConsultant', name);
    },
    updateConsultant: async (id: number, name: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:updateConsultant', id, name);
    },
    setConsultantActive: async (id: number, active: boolean): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setConsultantActive', id, active);
    },
    listDepartments: async (): Promise<MasterDataItem[]> => {
      return ipcRenderer.invoke('admin:listDepartments');
    },
    addDepartment: async (name: string): Promise<MasterDataItem> => {
      return ipcRenderer.invoke('admin:addDepartment', name);
    },
    updateDepartment: async (id: number, name: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:updateDepartment', id, name);
    },
    setDepartmentActive: async (id: number, active: boolean): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setDepartmentActive', id, active);
    },
    getDepartmentConsultants: async (departmentId: number): Promise<number[]> => {
      return ipcRenderer.invoke('admin:getDepartmentConsultants', departmentId);
    },
    setDepartmentConsultants: async (departmentId: number, consultantIds: number[]): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setDepartmentConsultants', departmentId, consultantIds);
    },
    getAnalytics: async (filters?: CsvExportFilters): Promise<AdminAnalytics> => {
      return ipcRenderer.invoke('admin:getAnalytics', filters);
    },
    getPatient: async (id: number): Promise<PatientData | null> => {
      return ipcRenderer.invoke('admin:getPatient', id);
    },
    restorePatient: async (id: number): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:restorePatient', id);
    },
    exportCsv: async (
      filters: CsvExportFilters
    ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> => {
      return ipcRenderer.invoke('admin:exportCsv', filters);
    },
    getReportPreview: async (filters: CsvExportFilters): Promise<PatientExportRow[]> => {
      return ipcRenderer.invoke('admin:getReportPreview', filters);
    },
    exportConsultantsCsv: async (): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> => {
      return ipcRenderer.invoke('admin:exportConsultantsCsv');
    },
    exportPatientsListCsv: async (
      query: string,
      registrationDate?: string,
      includeDeleted?: boolean
    ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> => {
      return ipcRenderer.invoke('admin:exportPatientsListCsv', query, registrationDate, includeDeleted);
    },
    createBackupNow: async (): Promise<{ success: boolean; file?: string; error?: string; created?: boolean }> => {
      return ipcRenderer.invoke('admin:createBackupNow');
    },
    listBackups: async (): Promise<BackupFileInfo[]> => {
      return ipcRenderer.invoke('admin:listBackups');
    },
    getBackupLocation: async (): Promise<BackupLocationInfo> => {
      return ipcRenderer.invoke('admin:getBackupLocation');
    },
    chooseBackupLocation: async (): Promise<{
      success: boolean;
      canceled?: boolean;
      error?: string;
      location: string | null;
    }> => {
      return ipcRenderer.invoke('admin:chooseBackupLocation');
    },
    clearBackupLocation: async (): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:clearBackupLocation');
    },
    openBackupFolder: async (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('admin:openBackupFolder');
    },
    getCloudBackupStatus: async (): Promise<CloudBackupStatus> => {
      return ipcRenderer.invoke('admin:getCloudBackupStatus');
    },
    listCloudBackups: async (): Promise<CloudBackupInfo[]> => {
      return ipcRenderer.invoke('admin:listCloudBackups');
    },
    uploadBackupNow: async (): Promise<{ success: boolean; error?: string; status?: string }> => {
      return ipcRenderer.invoke('admin:uploadBackupNow');
    },
    restoreBackup: async (source: RestoreSource): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('admin:restoreBackup', source);
    },
    getLanServerStatus: async (): Promise<LanServerStatus> => {
      return ipcRenderer.invoke('admin:getLanServerStatus');
    },
    startLanServer: async (): Promise<LanServerStatus> => {
      return ipcRenderer.invoke('admin:startLanServer');
    },
    stopLanServer: async (): Promise<LanServerStatus> => {
      return ipcRenderer.invoke('admin:stopLanServer');
    },
    restartLanServer: async (): Promise<LanServerStatus> => {
      return ipcRenderer.invoke('admin:restartLanServer');
    },
    getLanAddresses: async (): Promise<LanAddresses> => {
      return ipcRenderer.invoke('admin:getLanAddresses');
    },
    generateLanPairingCode: async (): Promise<LanPairingCode> => {
      return ipcRenderer.invoke('admin:generateLanPairingCode');
    },
    setLanServerPort: async (port: number): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setLanServerPort', port);
    },
  },

  // Data Sync API — deliberately separate from `admin` above: Reception's
  // own "Sync Now" action uses this too, not just Admin's. Sends/receives
  // structured patient records to/from the central server; never touches a
  // backup file (see the `admin.createBackupNow`/`admin.uploadBackupNow`
  // pair above for that, entirely separate functionality).
  sync: {
    syncNow: async (): Promise<SyncCycleResult> => {
      return ipcRenderer.invoke('sync:syncNow');
    },
    getStatus: async (): Promise<SyncStatus> => {
      return ipcRenderer.invoke('sync:getStatus');
    },
    connectToHospitalServer: async (
      address: string,
      pairingCode: string
    ): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('sync:connectToHospitalServer', address, pairingCode);
    },
  },

  // IPC for future use (add specific methods as needed)
  ipc: {
    send: (channel: string, data?: unknown) => {
      ipcRenderer.send(channel, data);
    },
    receive: (channel: string, callback: (data: unknown) => void) => {
      ipcRenderer.on(channel, (event, data) => callback(data));
    },
    invoke: (channel: string, data?: unknown) => {
      return ipcRenderer.invoke(channel, data);
    },
    // Remove listener when done
    removeListener: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  },
});

// Inform main process that preload is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('[Preload] IPC bridge ready');
});
