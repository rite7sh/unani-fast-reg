import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import LoginScreen from "./components/LoginScreen";
import AdminLoginScreen from "./components/AdminLoginScreen";
import AdminApp from "./components/AdminApp";
import DashboardScreen from "./components/DashboardScreen";
import RegistrationScreen from "./components/RegistrationScreen";
import PatientHistoryScreen from "./components/PatientHistoryScreen";

type Screen = "dashboard" | "registration" | "history";

export function App() {
  const [employee, setEmployee] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");

  // Admin is a structurally separate tree from the Employee flow below —
  // checked first and returned early, so no Employee screen's UI can ever
  // reach it, and no Admin screen is reachable except through this
  // password-gated login.
  const [loginMode, setLoginMode] = useState<"employee" | "admin">("employee");
  const [adminAuthed, setAdminAuthed] = useState(false);

  if (adminAuthed) {
    return (
      <AdminApp
        onLogout={() => {
          setAdminAuthed(false);
          setLoginMode("employee");
        }}
      />
    );
  }

  if (!employee) {
    if (loginMode === "admin") {
      return <AdminLoginScreen onSuccess={() => setAdminAuthed(true)} onBack={() => setLoginMode("employee")} />;
    }
    return (
      <LoginScreen
        onLogin={(name) => {
          setEmployee(name);
          setScreen("dashboard");
        }}
        onAdminLogin={() => setLoginMode("admin")}
      />
    );
  }

  function logout() {
    setEmployee(null);
    setScreen("dashboard");
  }

  if (screen === "registration") {
    return (
      <RegistrationScreen
        employee={employee}
        onLogout={logout}
        onBack={() => setScreen("dashboard")}
        onNavigateHistory={() => setScreen("history")}
      />
    );
  }

  if (screen === "history") {
    return (
      <PatientHistoryScreen
        employee={employee}
        onLogout={logout}
        onBack={() => setScreen("dashboard")}
      />
    );
  }

  return (
    <DashboardScreen
      employee={employee}
      onLogout={logout}
      onNavigateRegister={() => setScreen("registration")}
      onNavigateHistory={() => setScreen("history")}
    />
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

const root = ReactDOM.createRoot(rootElement);

function renderApp() {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

renderApp();

// Enable HMR hot updates
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    renderApp();
  });
}
