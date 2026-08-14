interface PatientData {
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
}

interface DatabaseAPI {
  registerPatient: (patient: Omit<PatientData, 'id' | 'opd_no' | 'created_at' | 'updated_at'>) => Promise<PatientData>;
  checkDuplicate: (patientName: string, ageYears: number) => Promise<DuplicateCheckResult>;
  searchPatients: (query: string) => Promise<SearchResult[]>;
  getPatient: (id: number) => Promise<PatientData | null>;
  updatePatient: (id: number, updates: Partial<PatientData>) => Promise<PatientData>;
  softDeletePatient: (id: number) => Promise<{ success: boolean }>;
  getDiagnoses: () => Promise<string[]>;
  getConsultants: () => Promise<string[]>;
  getReturningPatientAddress: (patientName: string) => Promise<string | null>;
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
  ipc: {
    send: (channel: string, data?: unknown) => void;
    receive: (channel: string, callback: (data: unknown) => void) => void;
    invoke: (channel: string, data?: unknown) => Promise<unknown>;
    removeListener: (channel: string) => void;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
