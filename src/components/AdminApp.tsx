import { useState } from "react";
import AdminDashboardScreen from "./AdminDashboardScreen";
import AdminDiagnosesScreen from "./AdminDiagnosesScreen";
import AdminConsultantsScreen from "./AdminConsultantsScreen";
import AdminPatientsScreen from "./AdminPatientsScreen";
import AdminReportsScreen from "./AdminReportsScreen";
import AdminBackupScreen from "./AdminBackupScreen";
import AdminSettingsScreen from "./AdminSettingsScreen";
import PrintSlip from "./PrintSlip";

export type AdminScreen = "dashboard" | "diagnoses" | "consultants" | "patients" | "reports" | "backup" | "settings";

const NAV_ITEMS: { key: AdminScreen; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "diagnoses", label: "Diagnoses" },
  { key: "consultants", label: "Consultants" },
  { key: "patients", label: "Patients" },
  { key: "reports", label: "Reports" },
  { key: "backup", label: "Backup" },
  { key: "settings", label: "Settings" },
];

// Structurally separate from the Employee app tree in main.tsx — this is
// the entire Admin surface, only ever mounted after AdminLoginScreen
// succeeds. No Employee screen links here, and nothing here links back
// into the Employee screens (Logout returns to the login chooser, not any
// Employee screen).
export default function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [screen, setScreen] = useState<AdminScreen>("dashboard");

  // Owned here, not inside AdminPatientsScreen — <PrintSlip> must be a
  // sibling of .appbar/.page (see the print-slip render below), matching
  // every other screen that prints. AdminPatientsScreen reports the
  // currently-selected patient up via onPatientChange so this stays in
  // sync without duplicating any print markup/logic.
  const [printPatient, setPrintPatient] = useState<PatientData | null>(null);

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <strong className="appbar-title">Unani Hospital</strong>
          <span className="appbar-pipe" aria-hidden="true">
            |
          </span>
          <span className="appbar-sub">Admin</span>
        </div>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`admin-nav-item${screen === item.key ? " active" : ""}`}
              onClick={() => setScreen(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="appbar-right">
          <button className="btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="page">
        {screen === "dashboard" && <AdminDashboardScreen onNavigate={setScreen} />}
        {screen === "diagnoses" && <AdminDiagnosesScreen />}
        {screen === "consultants" && <AdminConsultantsScreen />}
        {screen === "patients" && <AdminPatientsScreen onPatientChange={setPrintPatient} />}
        {screen === "reports" && <AdminReportsScreen />}
        {screen === "backup" && <AdminBackupScreen />}
        {screen === "settings" && <AdminSettingsScreen />}
      </main>

      <PrintSlip patient={printPatient} />
    </div>
  );
}
