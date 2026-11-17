export interface SyncPushResult {
    success: boolean;
    pushed: number;
    failed: number;
    error?: string;
}
export declare function pushPendingPatients(): Promise<SyncPushResult>;
export interface SyncPullResult {
    success: boolean;
    pulled: number;
    error?: string;
}
export declare function pullLatestPatients(): Promise<SyncPullResult>;
export interface SyncCycleResult {
    success: boolean;
    push: SyncPushResult;
    pull: SyncPullResult;
}
export declare function runSyncCycle(): Promise<SyncCycleResult>;
