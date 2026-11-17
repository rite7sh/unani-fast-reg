import { useEffect, useState, type FormEvent } from "react";

// Three modes: "login" (or "create" when no password exists yet — decided
// by window.electron.admin.hasPassword()) is the default; "recover" is
// reached only via the "Forgot Password?" link, only ever shown once a
// password already exists (first-run setup has no password to forget).
// Recovery itself is a single fixed code known only to the supplier —
// entering it correctly lets an admin set a brand new password. See
// electron/database.ts's recoverAdminPassword() for where that code lives.
export default function AdminLoginScreen({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [hasPassword, setHasPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "recover">("login");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [recoveryCode, setRecoveryCode] = useState("");

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

  function resetFormState() {
    setPassword("");
    setConfirmPassword("");
    setError("");
    setRecoveryCode("");
  }

  function startRecovery() {
    resetFormState();
    setMode("recover");
  }

  function backToSignIn() {
    resetFormState();
    setMode("login");
  }

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

  async function submitRecovery(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!recoveryCode.trim()) {
      setError("Enter the recovery code your supplier gave you.");
      return;
    }
    if (password.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.electron.admin.recoverPassword(recoveryCode, password);
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || "That recovery code did not work.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not reset password: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form
        className="login-card"
        onSubmit={mode === "recover" ? submitRecovery : hasPassword ? submitLogin : submitCreate}
      >
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v18M3 12h18" />
            </svg>
          </span>
          <div>
            <h1 className="brand-title">Unani Hospital</h1>
            <p className="brand-sub">
              {mode === "recover"
                ? "Recover Admin Access"
                : checking
                  ? "Admin Access"
                  : hasPassword
                    ? "Admin Login"
                    : "Set Up Admin Access"}
            </p>
          </div>
        </div>

        <hr className="rule" />

        {mode === "recover" ? (
          <>
            <p className="hint" style={{ marginBottom: 12 }}>
              Contact your software supplier for the recovery code, then enter it below along with a new
              password.
            </p>

            <label className="lbl" htmlFor="recovery-code">
              Recovery Code
            </label>
            <input
              id="recovery-code"
              className="inp"
              inputMode="numeric"
              autoFocus
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
            />

            <label className="lbl" htmlFor="admin-pw" style={{ marginTop: 12 }}>
              New Admin Password
            </label>
            <input
              id="admin-pw"
              className="inp"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <label className="lbl" htmlFor="admin-pw-confirm">
              Confirm New Password
            </label>
            <input
              id="admin-pw-confirm"
              className="inp"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <p className="err" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary block" disabled={busy}>
              {busy ? "Please wait…" : "Reset Password"}
            </button>
          </>
        ) : checking ? (
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
          {mode === "recover" ? (
            <button type="button" className="admin-login-link" onClick={backToSignIn}>
              Back to Sign In
            </button>
          ) : (
            <>
              {hasPassword && !checking && (
                <>
                  <button type="button" className="admin-login-link" onClick={startRecovery}>
                    Forgot Password?
                  </button>
                  {" · "}
                </>
              )}
              <button type="button" className="admin-login-link" onClick={onBack}>
                Back to Employee Login
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
