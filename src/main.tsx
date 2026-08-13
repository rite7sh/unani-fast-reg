import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import LoginScreen from "./components/LoginScreen";
import RegistrationScreen from "./components/RegistrationScreen";

export function App() {
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
