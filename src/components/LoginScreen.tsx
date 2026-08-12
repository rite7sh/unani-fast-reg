import { useState, type FormEvent } from "react";

export default function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!id.trim() || !pw.trim()) {
      setError("Employee ID and password are required.");
      return;
    }
    setError("");
    onLogin(id.trim().toUpperCase());
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18M3 12h18" />
            </svg>
          </span>
          <div>
            <h1 className="brand-title">Unani Hospital</h1>
            <p className="brand-sub">OPD Management System</p>
          </div>
        </div>

        <hr className="rule" />

        <label className="lbl" htmlFor="empid">
          Employee ID
        </label>
        <input
          id="empid"
          className="inp"
          autoFocus
          autoComplete="username"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />

        <label className="lbl" htmlFor="pw">
          Password
        </label>
        <div className="pw-row">
          <input
            id="pw"
            className="inp"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {error && <p className="err" role="alert">{error}</p>}

        <button type="submit" className="btn-primary block">
          Sign In
        </button>

        <p className="foot">Internal use only · v1.0.0</p>
      </form>
    </main>
  );
}
