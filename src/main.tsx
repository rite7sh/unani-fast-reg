import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import LoginScreen from "./components/LoginScreen";
import DashboardScreen from "./components/DashboardScreen";
import RegistrationScreen from "./components/RegistrationScreen";
import PatientHistoryScreen from "./components/PatientHistoryScreen";

type Screen = "dashboard" | "registration" | "history";

export function App() {
  const [employee, setEmployee] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");

  if (!employee) {
    return (
      <LoginScreen
        onLogin={(name) => {
          setEmployee(name);
          setScreen("dashboard");
        }}
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
