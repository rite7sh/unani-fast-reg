import type { ReactNode } from "react";

export default function AppHeader({
  employee,
  onLogout,
  subtitle,
  right,
}: {
  employee: string;
  onLogout: () => void;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="appbar">
      <div className="appbar-left">
        <strong className="appbar-title">Unani Hospital</strong>
        <span className="appbar-pipe" aria-hidden="true">
          |
        </span>
        <span className="appbar-sub">{subtitle ?? "OPD Management System"}</span>
      </div>
      <div className="appbar-right">
        {right}
        <span className="dot" aria-hidden="true" />
        <span className="meta">{employee}</span>
        <button className="btn-ghost" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  );
}
