import { useEffect, useState, type FormEvent } from "react";

function activeFilters(
  fromDate: string,
  toDate: string,
  gender: string,
  consultant: string,
  fromTime: string,
  toTime: string
): CsvExportFilters {
  return {
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(gender ? { gender } : {}),
    ...(consultant ? { consultant } : {}),
    ...(fromTime ? { fromTime } : {}),
    ...(toTime ? { toTime } : {}),
  };
}

export default function AdminReportsScreen() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [gender, setGender] = useState("");
  const [consultant, setConsultant] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");

  const [consultantOptions, setConsultantOptions] = useState<string[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview — the exact rows exportPatientsCsv() writes to disk (same
  // filters, same query, on the backend: getReportPreviewRows()). Debounced
  // like the app's other live-filter effects (e.g. Registration's duplicate
  // check) so typing a date doesn't fire a query per keystroke.
  const [previewRows, setPreviewRows] = useState<PatientExportRow[] | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    window.electron.db.getConsultants().then(setConsultantOptions).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingPreview(true);
    const timer = setTimeout(() => {
      window.electron.admin
        .getReportPreview(activeFilters(fromDate, toDate, gender, consultant, fromTime, toTime))
        .then((rows) => {
          if (!cancelled) {
            setPreviewRows(rows);
            setPreviewError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : String(err);
            setPreviewError(`Could not load preview: ${message}`);
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingPreview(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fromDate, toDate, gender, consultant, fromTime, toTime]);

  async function submitExport(e: FormEvent) {
    e.preventDefault();
    setIsExporting(true);
    setNotice(null);
    setError(null);
    try {
      const result = await window.electron.admin.exportCsv(
        activeFilters(fromDate, toDate, gender, consultant, fromTime, toTime)
      );
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
    <section className="panel panel-wide">
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
            <label className="lbl" htmlFor="rep-from-time">
              From Time
            </label>
            <input
              id="rep-from-time"
              type="time"
              className="inp"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="rep-to-time">
              To Time
            </label>
            <input
              id="rep-to-time"
              type="time"
              className="inp"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="rep-gender">
              Gender
            </label>
            <select id="rep-gender" className="inp" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Any</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Child">Child</option>
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
        </div>

        {notice && <p className="succ-note">{notice}</p>}
        {error && <p className="err">{error}</p>}

        <div className="actions bar">
          <button type="submit" className="btn-primary" disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </form>

      <h3 className="chart-card-title" style={{ marginTop: 28 }}>
        Preview {isLoadingPreview && <span className="meta-line dim">Loading…</span>}
      </h3>
      <p className="hint">This is exactly what Export CSV above will write — same filters, same rows.</p>

      {previewError && <p className="err">{previewError}</p>}

      {previewRows && previewRows.length === 0 && !isLoadingPreview ? (
        <p className="empty-note">No matching records for the current filters.</p>
      ) : (
        previewRows && (
          <div className="table-scroll table-scroll-bounded">
            <table className="hist-table preview-table">
              <thead>
                <tr>
                  <th className="col-opd">C.R. No.</th>
                  <th>Patient Name</th>
                  <th className="col-xs">Age</th>
                  <th className="col-xs">Gender</th>
                  <th>Aadhaar Number</th>
                  <th>Mobile Number</th>
                  <th>Department</th>
                  <th className="col-date">Registration Date</th>
                  <th className="col-xs">Time</th>
                  <th>Consultant</th>
                  <th>Registered By</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.opd_no}>
                    <td>
                      <span className="opd-chip">{r.opd_no}</span>
                    </td>
                    <td>{r.patient_name}</td>
                    <td>
                      {r.age_years}Y{r.age_months ? ` ${r.age_months}M` : ""}
                    </td>
                    <td>{r.gender}</td>
                    <td>{r.aadhaar_number || "—"}</td>
                    <td>{r.mobile_number || "—"}</td>
                    <td>{r.department || "—"}</td>
                    <td>{r.registration_date}</td>
                    <td>{r.registration_time || "—"}</td>
                    <td>{r.consultant}</td>
                    <td>{r.employee_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
