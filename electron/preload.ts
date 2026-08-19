import { contextBridge, ipcRenderer } from 'electron';

// Type for database operations
export interface PatientData {
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
  genderCounts: { label: string; count: number }[];
  consultantCounts: { label: string; count: number }[];
  diagnosisCounts: { label: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
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
    registerPatient: async (patient: Omit<PatientData, 'id' | 'opd_no' | 'created_at' | 'updated_at'>) => {
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
    softDeletePatient: async (id: number) => {
      return ipcRenderer.invoke('db:softDeletePatient', id);
    },
    getDiagnoses: async () => {
      return ipcRenderer.invoke('db:getDiagnoses');
    },
    getConsultants: async () => {
      return ipcRenderer.invoke('db:getConsultants');
    },
    getReturningPatientAddress: async (patientName: string) => {
      return ipcRenderer.invoke('db:getReturningPatientAddress', patientName);
    },
    getDashboardStats: async (): Promise<DashboardStats> => {
      return ipcRenderer.invoke('db:getDashboardStats');
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
    listDiagnoses: async (): Promise<MasterDataItem[]> => {
      return ipcRenderer.invoke('admin:listDiagnoses');
    },
    addDiagnosis: async (name: string): Promise<MasterDataItem> => {
      return ipcRenderer.invoke('admin:addDiagnosis', name);
    },
    updateDiagnosis: async (id: number, name: string): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:updateDiagnosis', id, name);
    },
    setDiagnosisActive: async (id: number, active: boolean): Promise<{ success: boolean }> => {
      return ipcRenderer.invoke('admin:setDiagnosisActive', id, active);
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
    getAnalytics: async (): Promise<AdminAnalytics> => {
      return ipcRenderer.invoke('admin:getAnalytics');
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
    createBackupNow: async (): Promise<{ success: boolean; file?: string; error?: string }> => {
      return ipcRenderer.invoke('admin:createBackupNow');
    },
    listBackups: async (): Promise<BackupFileInfo[]> => {
      return ipcRenderer.invoke('admin:listBackups');
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
