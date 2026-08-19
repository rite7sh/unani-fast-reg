import { useEffect, useState, type FormEvent } from "react";

// Two modes decided by whether an admin password has ever been set
// (window.electron.admin.hasPassword()): first run shows a "Create Admin
// Password" form with no hardcoded/default credential anywhere in the
// code; every run after that shows a plain password login.
export default function AdminLoginScreen({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron.admin
      .hasPassword()
      .then((result) => {
        if (!cancelled) setHasPassword(result);
      })
      .catch((err) => console.error("[AdminLogin] hasPassword check failed:", err))
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await window.electron.admin.setPassword(password);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not set admin password: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.electron.admin.login(password);
      if (result.success) {
        onSuccess();
      } else {
        setError("Incorrect admin password.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Login failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="login-card" onSubmit={hasPassword ? submitLogin : submitCreate}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18M3 12h18" />
            </svg>
          </span>
          <div>
            <h1 className="brand-title">Unani Hospital</h1>
            <p className="brand-sub">{checking ? "Admin Access" : hasPassword ? "Admin Login" : "Set Up Admin Access"}</p>
          </div>
        </div>

        <hr className="rule" />

        {checking ? (
          <p className="hint">Checking admin access…</p>
        ) : (
          <>
            {!hasPassword && (
              <p className="hint" style={{ marginBottom: 12 }}>
                No admin password has been set up yet. Choose one now — this will be required for all future
                admin access.
              </p>
            )}

            <label className="lbl" htmlFor="admin-pw">
              {hasPassword ? "Admin Password" : "New Admin Password"}
            </label>
            <input
              id="admin-pw"
              className="inp"
              type="password"
              autoFocus
              autoComplete={hasPassword ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {!hasPassword && (
              <>
                <label className="lbl" htmlFor="admin-pw-confirm">
                  Confirm Password
                </label>
                <input
                  id="admin-pw-confirm"
                  className="inp"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </>
            )}

            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary block" disabled={busy}>
              {busy ? "Please wait…" : hasPassword ? "Sign In" : "Create Admin Password"}
            </button>
          </>
        )}

        <p className="foot">
          <button type="button" className="admin-login-link" onClick={onBack}>
            Back to Employee Login
          </button>
        </p>
      </form>
    </main>
  );
}
