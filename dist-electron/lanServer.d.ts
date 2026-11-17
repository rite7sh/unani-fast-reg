export interface LanServerStatus {
    enabled: boolean;
    running: boolean;
    port: number | null;
    addresses: string[];
    lastError: string | null;
}
export declare function getLanAddresses(): {
    recommended: string | null;
    all: string[];
};
export declare function startLanServer(): Promise<LanServerStatus>;
export declare function stopLanServer(): Promise<LanServerStatus>;
export declare function killLanServerForShutdown(): Promise<void>;
export declare function restartLanServer(): Promise<LanServerStatus>;
export declare function getLanServerStatus(): LanServerStatus;
export declare function autoStartLanServerIfEnabled(): Promise<void>;
export declare function generatePairingCode(): Promise<{
    code: string;
    expiresAt: string;
}>;
export declare function setLanServerPortConfig(port: number): void;
