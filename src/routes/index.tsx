import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import LoginScreen from "../components/LoginScreen";
import RegistrationScreen from "../components/RegistrationScreen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Unani Hospital OPD Management System" },
      {
        name: "description",
        content:
          "Internal OPD management system for Unani Hospital reception: employee login and fast patient OPD registration.",
      },
      { property: "og:title", content: "Unani Hospital OPD Management System" },
      {
        property: "og:description",
        content: "Employee login and fast OPD patient registration for hospital reception desks.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [employee, setEmployee] = useState<string | null>(null);

  return employee ? (
    <RegistrationScreen employee={employee} onLogout={() => setEmployee(null)} />
  ) : (
    <LoginScreen onLogin={setEmployee} />
  );
}
