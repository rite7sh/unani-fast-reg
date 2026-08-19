import { useState, type FormEvent } from "react";

export default function AdminSettingsScreen() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await window.electron.admin.changePassword(currentPassword, newPassword);
      if (result.success) {
        setNotice("Admin password updated.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError("Current password is incorrect.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not change password: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Settings</h2>

      <form onSubmit={submit} style={{ maxWidth: 360 }}>
        <label className="lbl" htmlFor="cur-pw">
          Current Password
        </label>
        <input
          id="cur-pw"
          type="password"
          className="inp"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />

        <label className="lbl" htmlFor="new-pw" style={{ marginTop: 12 }}>
          New Password
        </label>
        <input
          id="new-pw"
          type="password"
          className="inp"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        <label className="lbl" htmlFor="new-pw-confirm" style={{ marginTop: 12 }}>
          Confirm New Password
        </label>
        <input
          id="new-pw-confirm"
          type="password"
          className="inp"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {notice && <p className="succ-note">{notice}</p>}
        {error && <p className="err">{error}</p>}

        <div className="actions bar">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Updating..." : "Change Password"}
          </button>
        </div>
      </form>
    </section>
  );
}
