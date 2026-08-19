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
        softDeletePatient: async (id) => {
            return electron_1.ipcRenderer.invoke('db:softDeletePatient', id);
        },
        getDiagnoses: async () => {
            return electron_1.ipcRenderer.invoke('db:getDiagnoses');
        },
        getConsultants: async () => {
            return electron_1.ipcRenderer.invoke('db:getConsultants');
        },
        getReturningPatientAddress: async (patientName) => {
            return electron_1.ipcRenderer.invoke('db:getReturningPatientAddress', patientName);
        },
        getDashboardStats: async () => {
            return electron_1.ipcRenderer.invoke('db:getDashboardStats');
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
        listDiagnoses: async () => {
            return electron_1.ipcRenderer.invoke('admin:listDiagnoses');
        },
        addDiagnosis: async (name) => {
            return electron_1.ipcRenderer.invoke('admin:addDiagnosis', name);
        },
        updateDiagnosis: async (id, name) => {
            return electron_1.ipcRenderer.invoke('admin:updateDiagnosis', id, name);
        },
        setDiagnosisActive: async (id, active) => {
            return electron_1.ipcRenderer.invoke('admin:setDiagnosisActive', id, active);
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
        getAnalytics: async () => {
            return electron_1.ipcRenderer.invoke('admin:getAnalytics');
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
        createBackupNow: async () => {
            return electron_1.ipcRenderer.invoke('admin:createBackupNow');
        },
        listBackups: async () => {
            return electron_1.ipcRenderer.invoke('admin:listBackups');
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
