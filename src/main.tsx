import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import LoginScreen from "./components/LoginScreen";
import RegistrationScreen from "./components/RegistrationScreen";

function App() {
  const [employee, setEmployee] = useState<string | null>(null);

  if (!employee) {
    return <LoginScreen onLogin={setEmployee} />;
  }

  return (
    <RegistrationScreen
      employee={employee}
      onLogout={() => setEmployee(null)}
    />
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
