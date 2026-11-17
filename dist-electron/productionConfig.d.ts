export declare function getProductionConfigPath(): string;
export declare function getHospitalId(): string;
export declare function getApiBaseUrl(): string | null;
export declare function getDeviceSetupToken(): string | null;
export declare function requireApiBaseUrl(): string;
export declare function describeConnectionFailure(error: unknown, feature: 'Cloud backup' | 'Data sync'): string;
export declare function scrubSetupTokenFromConfig(): void;
export declare function setConfigValue(key: string, value: string): void;
