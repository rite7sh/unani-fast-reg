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
export declare function ensurePaired(): Promise<{
    deviceId: string;
    apiKey: string;
}>;
export declare function connectToHospitalServer(rawAddress: string, pairingCode: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function uploadBackupFile(filePath: string): Promise<{
    success: boolean;
    error?: string;
    status?: string;
}>;
export declare function listCloudBackups(): Promise<CloudBackupInfo[]>;
export declare function downloadCloudBackup(filename: string, destPath: string): Promise<void>;
export declare function getCloudBackupStatus(): CloudBackupStatus;
