"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Secure context bridge - only expose what's necessary
electron_1.contextBridge.exposeInMainWorld('electron', {
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
        registerPatient: async (patient) => {
            return electron_1.ipcRenderer.invoke('db:registerPatient', patient);
        },
        checkDuplicate: async (patientName, ageYears) => {
            return electron_1.ipcRenderer.invoke('db:checkDuplicate', patientName, ageYears);
        },
        searchPatients: async (query, registrationDate, includeDeleted) => {
            return electron_1.ipcRenderer.invoke('db:searchPatients', query, registrationDate, includeDeleted);
        },
        getPatient: async (id) => {
            return electron_1.ipcRenderer.invoke('db:getPatient', id);
        },
        updatePatient: async (id, updates) => {
            return electron_1.ipcRenderer.invoke('db:updatePatient', id, updates);
        },
        // No softDeletePatient here — deliberate; see main.ts's comment above
        // the (removed) db:softDeletePatient handler for why.
        getConsultants: async () => {
            return electron_1.ipcRenderer.invoke('db:getConsultants');
        },
        getDepartments: async () => {
            return electron_1.ipcRenderer.invoke('db:getDepartments');
        },
        getConsultantsForDepartment: async (departmentName) => {
            return electron_1.ipcRenderer.invoke('db:getConsultantsForDepartment', departmentName);
        },
        getReturningPatientAddress: async (patientName) => {
            return electron_1.ipcRenderer.invoke('db:getReturningPatientAddress', patientName);
        },
        getDashboardStats: async (filters) => {
            return electron_1.ipcRenderer.invoke('db:getDashboardStats', filters);
        },
        previewNextOpdNumber: async () => {
            return electron_1.ipcRenderer.invoke('db:previewNextOpdNumber');
        },
        getBackupStatus: async () => {
            return electron_1.ipcRenderer.invoke('db:getBackupStatus');
        },
    },
    // Admin API — auth + master-data management. Only ever called from
    // Admin screens, which only render after a successful admin login; see
    // src/main.tsx. Not a hardened per-call session/token system — this
    // remains a single trusted local renderer (contextIsolation/sandbox/
    // nodeIntegration unchanged), matching the existing Employee login's
    // trust model.
    admin: {
        hasPassword: async () => {
            return electron_1.ipcRenderer.invoke('admin:hasPassword');
        },
        setPassword: async (password) => {
            return electron_1.ipcRenderer.invoke('admin:setPassword', password);
        },
        login: async (password) => {
            return electron_1.ipcRenderer.invoke('admin:login', password);
        },
        changePassword: async (currentPassword, newPassword) => {
            return electron_1.ipcRenderer.invoke('admin:changePassword', currentPassword, newPassword);
        },
        recoverPassword: async (recoveryCode, newPassword) => {
            return electron_1.ipcRenderer.invoke('admin:recoverPassword', recoveryCode, newPassword);
        },
        listConsultants: async () => {
            return electron_1.ipcRenderer.invoke('admin:listConsultants');
        },
        addConsultant: async (name) => {
            return electron_1.ipcRenderer.invoke('admin:addConsultant', name);
        },
        updateConsultant: async (id, name) => {
            return electron_1.ipcRenderer.invoke('admin:updateConsultant', id, name);
        },
        setConsultantActive: async (id, active) => {
            return electron_1.ipcRenderer.invoke('admin:setConsultantActive', id, active);
        },
        listDepartments: async () => {
            return electron_1.ipcRenderer.invoke('admin:listDepartments');
        },
        addDepartment: async (name) => {
            return electron_1.ipcRenderer.invoke('admin:addDepartment', name);
        },
        updateDepartment: async (id, name) => {
            return electron_1.ipcRenderer.invoke('admin:updateDepartment', id, name);
        },
        setDepartmentActive: async (id, active) => {
            return electron_1.ipcRenderer.invoke('admin:setDepartmentActive', id, active);
        },
        getDepartmentConsultants: async (departmentId) => {
            return electron_1.ipcRenderer.invoke('admin:getDepartmentConsultants', departmentId);
        },
        setDepartmentConsultants: async (departmentId, consultantIds) => {
            return electron_1.ipcRenderer.invoke('admin:setDepartmentConsultants', departmentId, consultantIds);
        },
        getAnalytics: async (filters) => {
            return electron_1.ipcRenderer.invoke('admin:getAnalytics', filters);
        },
        getPatient: async (id) => {
            return electron_1.ipcRenderer.invoke('admin:getPatient', id);
        },
        restorePatient: async (id) => {
            return electron_1.ipcRenderer.invoke('admin:restorePatient', id);
        },
        exportCsv: async (filters) => {
            return electron_1.ipcRenderer.invoke('admin:exportCsv', filters);
        },
        getReportPreview: async (filters) => {
            return electron_1.ipcRenderer.invoke('admin:getReportPreview', filters);
        },
        exportConsultantsCsv: async () => {
            return electron_1.ipcRenderer.invoke('admin:exportConsultantsCsv');
        },
        exportPatientsListCsv: async (query, registrationDate, includeDeleted) => {
            return electron_1.ipcRenderer.invoke('admin:exportPatientsListCsv', query, registrationDate, includeDeleted);
        },
        createBackupNow: async () => {
            return electron_1.ipcRenderer.invoke('admin:createBackupNow');
        },
        listBackups: async () => {
            return electron_1.ipcRenderer.invoke('admin:listBackups');
        },
        getBackupLocation: async () => {
            return electron_1.ipcRenderer.invoke('admin:getBackupLocation');
        },
        chooseBackupLocation: async () => {
            return electron_1.ipcRenderer.invoke('admin:chooseBackupLocation');
        },
        clearBackupLocation: async () => {
            return electron_1.ipcRenderer.invoke('admin:clearBackupLocation');
        },
        openBackupFolder: async () => {
            return electron_1.ipcRenderer.invoke('admin:openBackupFolder');
        },
        getCloudBackupStatus: async () => {
            return electron_1.ipcRenderer.invoke('admin:getCloudBackupStatus');
        },
        listCloudBackups: async () => {
            return electron_1.ipcRenderer.invoke('admin:listCloudBackups');
        },
        uploadBackupNow: async () => {
            return electron_1.ipcRenderer.invoke('admin:uploadBackupNow');
        },
        restoreBackup: async (source) => {
            return electron_1.ipcRenderer.invoke('admin:restoreBackup', source);
        },
        getLanServerStatus: async () => {
            return electron_1.ipcRenderer.invoke('admin:getLanServerStatus');
        },
        startLanServer: async () => {
            return electron_1.ipcRenderer.invoke('admin:startLanServer');
        },
        stopLanServer: async () => {
            return electron_1.ipcRenderer.invoke('admin:stopLanServer');
        },
        restartLanServer: async () => {
            return electron_1.ipcRenderer.invoke('admin:restartLanServer');
        },
        getLanAddresses: async () => {
            return electron_1.ipcRenderer.invoke('admin:getLanAddresses');
        },
        generateLanPairingCode: async () => {
            return electron_1.ipcRenderer.invoke('admin:generateLanPairingCode');
        },
        setLanServerPort: async (port) => {
            return electron_1.ipcRenderer.invoke('admin:setLanServerPort', port);
        },
    },
    // Data Sync API — deliberately separate from `admin` above: Reception's
    // own "Sync Now" action uses this too, not just Admin's. Sends/receives
    // structured patient records to/from the central server; never touches a
    // backup file (see the `admin.createBackupNow`/`admin.uploadBackupNow`
    // pair above for that, entirely separate functionality).
    sync: {
        syncNow: async () => {
            return electron_1.ipcRenderer.invoke('sync:syncNow');
        },
        getStatus: async () => {
            return electron_1.ipcRenderer.invoke('sync:getStatus');
        },
        connectToHospitalServer: async (address, pairingCode) => {
            return electron_1.ipcRenderer.invoke('sync:connectToHospitalServer', address, pairingCode);
        },
    },
    // IPC for future use (add specific methods as needed)
    ipc: {
        send: (channel, data) => {
            electron_1.ipcRenderer.send(channel, data);
        },
        receive: (channel, callback) => {
            electron_1.ipcRenderer.on(channel, (event, data) => callback(data));
        },
        invoke: (channel, data) => {
            return electron_1.ipcRenderer.invoke(channel, data);
        },
        // Remove listener when done
        removeListener: (channel) => {
            electron_1.ipcRenderer.removeAllListeners(channel);
        },
    },
});
// Inform main process that preload is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Preload] IPC bridge ready');
});
