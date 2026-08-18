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
    searchPatients: async (query: string, registrationDate?: string) => {
      return ipcRenderer.invoke('db:searchPatients', query, registrationDate);
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
