import { useEffect, useState, type FormEvent } from "react";

export default function AdminReportsScreen() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [gender, setGender] = useState("");
  const [consultant, setConsultant] = useState("");
  const [diagnosis, setDiagnosis] = useState("");

  const [consultantOptions, setConsultantOptions] = useState<string[]>([]);
  const [diagnosisOptions, setDiagnosisOptions] = useState<string[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electron.db.getConsultants().then(setConsultantOptions).catch(() => undefined);
    window.electron.db.getDiagnoses().then(setDiagnosisOptions).catch(() => undefined);
  }, []);

  async function submitExport(e: FormEvent) {
    e.preventDefault();
    setIsExporting(true);
    setNotice(null);
    setError(null);
    try {
      const result = await window.electron.admin.exportCsv({
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
        ...(gender ? { gender } : {}),
        ...(consultant ? { consultant } : {}),
        ...(diagnosis ? { diagnosis } : {}),
      });
      if (result.canceled) {
        setNotice("Export canceled.");
      } else if (result.success) {
        setNotice(`Exported to ${result.filePath}`);
      } else {
        setError("Export failed.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Export failed: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Reports</h2>
      <p className="hint">
        Export active (non-deleted) registrations as CSV — opens directly in Excel. Leave any filter blank to
        include all values for that field.
      </p>

      <form onSubmit={submitExport}>
        <div className="grid">
          <div>
            <label className="lbl" htmlFor="rep-from">
              From Date
            </label>
            <input
              id="rep-from"
              type="date"
              className="inp"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="rep-to">
              To Date
            </label>
            <input id="rep-to" type="date" className="inp" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div>
            <label className="lbl" htmlFor="rep-gender">
              Gender
            </label>
            <select id="rep-gender" className="inp" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Any</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="rep-consultant">
              Consultant
            </label>
            <select
              id="rep-consultant"
              className="inp"
              value={consultant}
              onChange={(e) => setConsultant(e.target.value)}
            >
              <option value="">Any</option>
              {consultantOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="rep-diagnosis">
              Diagnosis
            </label>
            <select
              id="rep-diagnosis"
              className="inp"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
            >
              <option value="">Any</option>
              {diagnosisOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {notice && <p className="succ-note">{notice}</p>}
        {error && <p className="err">{error}</p>}

        <div className="actions bar">
          <button type="submit" className="btn-primary" disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </form>
    </section>
  );
}
