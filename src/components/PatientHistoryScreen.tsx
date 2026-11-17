import { useEffect, useState, type FormEvent } from "react";
import AppHeader from "./AppHeader";
import SyncStatusWidget from "./SyncStatusWidget";
import PrintSlip from "./PrintSlip";
import SplitDivider from "./SplitDivider";
import { printSlip } from "../lib/printSlip";
import { useResizableSplit } from "../hooks/useResizableSplit";

// Table has 7 columns (C.R. No./Name/Age/Gender/Department/Registration
// Date/Consultant) at auto layout — narrower than this and long values
// wrap heavily enough to feel broken rather than just compact.
const LIST_MIN_WIDTH = 420;
const DETAIL_MIN_WIDTH = 340;

// Convert a native <input type="date"> value (YYYY-MM-DD) to the
// DD/MM/YYYY format used for registration_date. Pure string manipulation —
// no Date object, no timezone conversion, no off-by-one risk.
function isoToRegistrationDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function PatientHistoryScreen({
  employee,
  onLogout,
  onBack,
}: {
  employee: string;
  onLogout: () => void;
  onBack: () => void;
}) {
  const [nameOrOpd, setNameOrOpd] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelected] = useState<PatientData | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const { containerRef, leftWidth, startDrag, onKeyDown, minLeft, maxWidth } = useResizableSplit({
    minLeft: LIST_MIN_WIDTH,
    minRight: DETAIL_MIN_WIDTH,
  });

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    setIsSearching(true);
    setSearchError(null);
    try {
      const registrationDate = dateInput ? isoToRegistrationDate(dateInput) : undefined;
      const rows = await window.electron.db.searchPatients(nameOrOpd.trim(), registrationDate);
      setResults(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[History] Search failed:", message);
      setSearchError(`Search failed: ${message}`);
    } finally {
      setIsSearching(false);
    }
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    runSearch();
  }

  function clearSearch() {
    setNameOrOpd("");
    setDateInput("");
    setTimeout(runSearch, 0);
  }

  async function openPatient(id: number) {
    setDetailError(null);
    try {
      const patient = await window.electron.db.getPatient(id);
      setSelected(patient);
      if (!patient) {
        setDetailError("This record could not be found (it may have been deleted).");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[History] getPatient failed:", message);
      setDetailError(`Could not open patient: ${message}`);
    }
  }

  function closeDetail() {
    setSelected(null);
    setDetailError(null);
  }

  const listPanel = (
    <section
      className={selected ? "panel split-list-panel" : "panel"}
      style={selected ? { width: leftWidth ?? undefined, minWidth: LIST_MIN_WIDTH } : undefined}
    >
      <h2 className="panel-title">Patient History / Search</h2>

      <form className="search-bar" onSubmit={submitSearch}>
        <div className="search-field">
          <label className="lbl" htmlFor="hist-query">
            Search by Patient Name or C.R. No.
          </label>
          <input
            id="hist-query"
            className="inp"
            placeholder="e.g. abc or CR-2026-00001"
            value={nameOrOpd}
            onChange={(e) => setNameOrOpd(e.target.value)}
          />
        </div>
        <div className="search-field">
          <label className="lbl" htmlFor="hist-date">
            Registration Date
          </label>
          <input
            id="hist-date"
            type="date"
            className="inp"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
          />
        </div>
        <div className="search-field">
          <button type="submit" className="btn-primary" disabled={isSearching}>
            {isSearching ? "Searching..." : "Search"}
          </button>
        </div>
        <div className="search-field">
          <button type="button" className="btn-secondary" onClick={clearSearch} disabled={isSearching}>
            Clear
          </button>
        </div>
      </form>

      {searchError && <p className="err">{searchError}</p>}

      {results.length === 0 && !isSearching && !searchError ? (
        <p className="empty-note">No matching patients found.</p>
      ) : (
        <table className="hist-table">
          <thead>
            <tr>
              <th>C.R. No.</th>
              <th>Patient Name</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Department</th>
              <th>Registration Date</th>
              <th>Consultant</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} onClick={() => openPatient(r.id)}>
                <td>
                  <span className="opd-chip">{r.opd_no}</span>
                </td>
                <td>{r.patient_name}</td>
                <td>
                  {r.age_years}Y{r.age_months ? ` ${r.age_months}M` : ""}
                </td>
                <td>{r.gender}</td>
                <td>{r.department || "—"}</td>
                <td>{r.registration_date}</td>
                <td>{r.consultant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  return (
    <div className="app">
      <AppHeader
        employee={employee}
        onLogout={onLogout}
        subtitle="Patient History"
        right={
          <>
            <SyncStatusWidget />
            <span className="dot" aria-hidden="true" />
            <button className="btn-ghost" onClick={onBack}>
              Back to Dashboard
            </button>
          </>
        }
      />

      <main className="page">
        {!selected ? (
          listPanel
        ) : (
          <div className="split-panels" ref={containerRef}>
            {listPanel}
            <SplitDivider value={leftWidth} min={minLeft} max={maxWidth} onPointerDown={startDrag} onKeyDown={onKeyDown} />
            <section className="panel detail-panel split-detail-panel">
              <h2 className="panel-title">
                <span className="opd-label">C.R. No.</span>
                <span className="opd-chip">{selected.opd_no}</span>
                {" — "}
                {selected.patient_name}
              </h2>

              {detailError && <p className="err">{detailError}</p>}

              <div className="detail-grid">
                <div className="detail-row">
                  <span className="lbl">Age</span>
                  <div className="detail-value">
                    {selected.age_years}Y{selected.age_months ? ` ${selected.age_months}M` : ""}
                  </div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Gender</span>
                  <div className="detail-value">{selected.gender}</div>
                </div>
                <div className="detail-row span2">
                  <span className="lbl">Address</span>
                  <div className="detail-value">{selected.address}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Aadhaar Number</span>
                  <div className="detail-value">{selected.aadhaar_number || "—"}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Mobile Number</span>
                  <div className="detail-value">{selected.mobile_number || "—"}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Department</span>
                  <div className="detail-value">{selected.department || "—"}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Consultant</span>
                  <div className="detail-value">{selected.consultant}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Registration Date</span>
                  <div className="detail-value">{selected.registration_date}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Registration Time</span>
                  <div className="detail-value">{selected.registration_time || "—"}</div>
                </div>
                <div className="detail-row">
                  <span className="lbl">Registered By</span>
                  <div className="detail-value">{selected.employee_id}</div>
                </div>
              </div>

              <div className="actions bar">
                <button className="btn-secondary" onClick={closeDetail}>
                  Close
                </button>
                <button className="btn-primary" onClick={printSlip}>
                  Print
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      <PrintSlip patient={selected} />
    </div>
  );
}
