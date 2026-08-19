import { useEffect, useState, type FormEvent } from "react";
import { printSlip } from "../lib/printSlip";

// Convert a native <input type="date"> value (YYYY-MM-DD) to the
// DD/MM/YYYY format used for registration_date. Pure string manipulation —
// mirrors the same helper in PatientHistoryScreen.tsx.
function isoToRegistrationDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// DD/MM/YYYY -> YYYY-MM-DD, for pre-filling the date input when editing.
function registrationDateToIso(reg: string): string {
  const [d, m, y] = reg.split("/");
  return `${y}-${m}-${d}`;
}

type EditForm = {
  patient_name: string;
  age_years: string;
  age_months: string;
  gender: string;
  registration_date_iso: string;
  address: string;
  diagnosis: string;
  diagnosis_other: string;
  consultant: string;
};

function toEditForm(p: PatientData): EditForm {
  return {
    patient_name: p.patient_name,
    age_years: String(p.age_years),
    age_months: String(p.age_months),
    gender: p.gender,
    registration_date_iso: registrationDateToIso(p.registration_date),
    address: p.address,
    diagnosis: p.diagnosis,
    diagnosis_other: p.diagnosis_other || "",
    consultant: p.consultant,
  };
}

// Broader than Employee's (removed) Edit UI — Admin can correct Name, Age,
// Gender, Registration Date (matches the proposal's "Administrator can
// unlock for backdating"), Address, Diagnosis, Consultant. OPD No. is
// never editable, here or in the backend's updatePatient allowedFields.
//
// onPatientChange: PrintSlip must render as a sibling of .appbar/.page
// (like every other screen), not nested inside .page — @media print sets
// .appbar and .page to display:none, and a display:none ancestor hides
// all descendants regardless of their own display rules, which is exactly
// why nesting <PrintSlip> inside this component (itself rendered inside
// .page by AdminApp) printed a blank page. AdminApp owns the actual
// <PrintSlip> element and the patient it prints; this callback keeps that
// mirrored copy in sync with local `selected` state whenever it changes.
export default function AdminPatientsScreen({
  onPatientChange,
}: {
  onPatientChange?: (patient: PatientData | null) => void;
}) {
  const [nameOrOpd, setNameOrOpd] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selected, setSelectedState] = useState<PatientData | null>(null);
  function setSelected(patient: PatientData | null) {
    setSelectedState(patient);
    onPatientChange?.(patient);
  }
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [diagnosisOptions, setDiagnosisOptions] = useState<string[]>([]);
  const [consultantOptions, setConsultantOptions] = useState<string[]>([]);

  useEffect(() => {
    runSearch();
    window.electron.db.getDiagnoses().then(setDiagnosisOptions).catch(() => undefined);
    window.electron.db.getConsultants().then(setConsultantOptions).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accepts explicit overrides rather than always reading state — callers
  // that change state and then immediately (via setTimeout) re-run the
  // search are calling this in the same tick as the setState, before that
  // update has landed, so reading state directly here would search with
  // the pre-change value.
  async function runSearch(overrides?: { nameOrOpd?: string; dateInput?: string; includeDeleted?: boolean }) {
    const effectiveName = overrides?.nameOrOpd ?? nameOrOpd;
    const effectiveDate = overrides?.dateInput ?? dateInput;
    const effectiveIncludeDeleted = overrides?.includeDeleted ?? includeDeleted;
    setIsSearching(true);
    setSearchError(null);
    try {
      const registrationDate = effectiveDate ? isoToRegistrationDate(effectiveDate) : undefined;
      const rows = await window.electron.db.searchPatients(effectiveName.trim(), registrationDate, effectiveIncludeDeleted);
      setResults(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[AdminPatients] Search failed:", message);
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
    setTimeout(() => runSearch({ nameOrOpd: "", dateInput: "" }), 0);
  }

  async function openPatient(id: number): Promise<PatientData | null> {
    setDetailError(null);
    setNotice(null);
    setIsEditing(false);
    try {
      const patient = await window.electron.admin.getPatient(id);
      setSelected(patient);
      if (!patient) {
        setDetailError("This record could not be found.");
      }
      return patient;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[AdminPatients] getPatient failed:", message);
      setDetailError(`Could not open patient: ${message}`);
      return null;
    }
  }

  // Row-level Print (Actions column): select the patient, then print once
  // that selection has actually committed to the DOM — printRequestId is a
  // separate effect trigger (not [selected]) so it never fires from
  // unrelated setSelected calls elsewhere (e.g. after Edit/Restore).
  const [printRequestId, setPrintRequestId] = useState(0);

  useEffect(() => {
    if (printRequestId > 0) {
      printSlip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printRequestId]);

  async function printRow(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    await openPatient(id);
    setPrintRequestId((n) => n + 1);
  }

  async function editRow(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const patient = await openPatient(id);
    if (patient) {
      setEditForm(toEditForm(patient));
      setIsEditing(true);
    }
  }

  function closeDetail() {
    setSelected(null);
    setIsEditing(false);
    setDetailError(null);
  }

  function startEdit() {
    if (!selected) return;
    setEditForm(toEditForm(selected));
    setIsEditing(true);
  }

  async function saveEdit() {
    if (!selected || !editForm) return;
    setIsSaving(true);
    setDetailError(null);
    try {
      const updated = await window.electron.db.updatePatient(selected.id as number, {
        patient_name: editForm.patient_name.trim(),
        age_years: Number(editForm.age_years) || 0,
        age_months: Number(editForm.age_months) || 0,
        gender: editForm.gender,
        registration_date: isoToRegistrationDate(editForm.registration_date_iso),
        address: editForm.address.trim(),
        diagnosis: editForm.diagnosis,
        consultant: editForm.consultant,
        ...(editForm.diagnosis === "Other" ? { diagnosis_other: editForm.diagnosis_other.trim() } : {}),
      });
      setSelected(updated);
      setIsEditing(false);
      setNotice(`${updated.opd_no} was updated.`);
      runSearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[AdminPatients] updatePatient failed:", message);
      setDetailError(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  // Defaults to the currently open detail record, but the row-level
  // Restore button (Actions column) can restore a record that isn't open.
  async function restore(id?: number) {
    const targetId = id ?? selected?.id;
    if (!targetId) return;
    setIsRestoring(true);
    setDetailError(null);
    try {
      await window.electron.admin.restorePatient(targetId);
      const patient = await window.electron.admin.getPatient(targetId);
      setSelected(patient);
      setNotice(`${patient?.opd_no ?? "Record"} was restored to active records.`);
      runSearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[AdminPatients] restorePatient failed:", message);
      setDetailError(`Restore failed: ${message}`);
    } finally {
      setIsRestoring(false);
    }
  }

  function restoreRow(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    restore(id);
  }

  // Keep the record's current diagnosis/consultant selectable even if it
  // was since deactivated in master data — otherwise opening the edit form
  // would silently force a change just by rendering a <select>.
  const diagnosisSelectOptions =
    editForm && !diagnosisOptions.includes(editForm.diagnosis) && editForm.diagnosis !== "Other"
      ? [...diagnosisOptions, editForm.diagnosis]
      : diagnosisOptions;
  const consultantSelectOptions =
    editForm && !consultantOptions.includes(editForm.consultant)
      ? [...consultantOptions, editForm.consultant]
      : consultantOptions;

  return (
    <>
      <section className="panel panel-wide">
        <h2 className="panel-title">Patients</h2>

        {notice && <p className="succ-note">{notice}</p>}

        <form className="search-bar" onSubmit={submitSearch}>
          <div className="search-field">
            <label className="lbl" htmlFor="admin-hist-query">
              Search by Patient Name or OPD No.
            </label>
            <input
              id="admin-hist-query"
              className="inp"
              placeholder="e.g. abc or OPD-2026-00001"
              value={nameOrOpd}
              onChange={(e) => setNameOrOpd(e.target.value)}
            />
          </div>
          <div className="search-field">
            <label className="lbl" htmlFor="admin-hist-date">
              Registration Date
            </label>
            <input
              id="admin-hist-date"
              type="date"
              className="inp"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
            />
          </div>
          <div className="search-field">
            <label className="radio" htmlFor="admin-hist-deleted">
              <input
                id="admin-hist-deleted"
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIncludeDeleted(next);
                  setTimeout(() => runSearch({ includeDeleted: next }), 0);
                }}
              />
              Include deleted
            </label>
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
          <table className="hist-table patients-table">
            <thead>
              <tr>
                <th className="col-opd">OPD No.</th>
                <th>Patient Name</th>
                <th className="col-xs">Age</th>
                <th className="col-xs">Gender</th>
                <th>Diagnosis</th>
                <th className="col-date">Registration Date</th>
                <th>Consultant</th>
                <th className="col-status">Status</th>
                <th className="actions-cell">Actions</th>
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
                  <td>{r.diagnosis}</td>
                  <td>{r.registration_date}</td>
                  <td>{r.consultant}</td>
                  <td>
                    <span className={r.is_deleted ? "status-badge inactive" : "status-badge active"}>
                      {r.is_deleted ? "Deleted" : "Active"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <div className="table-actions">
                      <button className="btn-secondary sm" onClick={(e) => printRow(r.id, e)}>
                        Print
                      </button>
                      {r.is_deleted ? (
                        <button className="btn-secondary sm" onClick={(e) => restoreRow(r.id, e)}>
                          Restore
                        </button>
                      ) : (
                        <button className="btn-secondary sm" onClick={(e) => editRow(r.id, e)}>
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {selected && (
        <section className="panel panel-wide detail-panel">
          <h2 className="panel-title">
            <span className="opd-label">OPD No.</span>
            <span className="opd-chip">{selected.opd_no}</span>
            {" — "}
            {selected.patient_name}
            {selected.is_deleted ? <span className="status-badge inactive" style={{ marginLeft: 10 }}>Deleted</span> : null}
          </h2>

          {detailError && <p className="err">{detailError}</p>}

          {!isEditing ? (
            <>
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
                  <span className="lbl">Diagnosis</span>
                  <div className="detail-value">
                    {selected.diagnosis === "Other" ? selected.diagnosis_other : selected.diagnosis}
                  </div>
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
                  <span className="lbl">Registered By</span>
                  <div className="detail-value">{selected.employee_id}</div>
                </div>
              </div>

              <div className="actions bar">
                <button className="btn-secondary" onClick={closeDetail}>
                  Close
                </button>
                {selected.is_deleted ? (
                  <button className="btn-primary" onClick={() => restore()} disabled={isRestoring}>
                    {isRestoring ? "Restoring..." : "Restore"}
                  </button>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={startEdit}>
                      Edit
                    </button>
                    <button className="btn-primary" onClick={printSlip}>
                      Print
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            editForm && (
              <>
                <div className="grid">
                  <div>
                    <label className="lbl">Patient Name</label>
                    <input
                      className="inp"
                      value={editForm.patient_name}
                      onChange={(e) => setEditForm({ ...editForm, patient_name: e.target.value })}
                    />
                  </div>
                  <div className="radios" style={{ marginTop: 20 }}>
                    {["Male", "Female", "Other"].map((g) => (
                      <label className="radio" key={g}>
                        <input
                          type="radio"
                          name="admin-edit-gender"
                          checked={editForm.gender === g}
                          onChange={() => setEditForm({ ...editForm, gender: g })}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="lbl">Age (Years)</label>
                    <input
                      className="inp narrow"
                      type="number"
                      min={0}
                      max={120}
                      value={editForm.age_years}
                      onChange={(e) => setEditForm({ ...editForm, age_years: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="lbl">Age (Months)</label>
                    <input
                      className="inp narrow"
                      type="number"
                      min={0}
                      max={11}
                      value={editForm.age_months}
                      onChange={(e) => setEditForm({ ...editForm, age_months: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="lbl">Registration Date</label>
                    <input
                      className="inp"
                      type="date"
                      value={editForm.registration_date_iso}
                      onChange={(e) => setEditForm({ ...editForm, registration_date_iso: e.target.value })}
                    />
                  </div>
                  <div className="span2">
                    <label className="lbl">Address</label>
                    <textarea
                      className="inp ta"
                      value={editForm.address}
                      onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="lbl">Diagnosis</label>
                    <select
                      className="inp"
                      value={editForm.diagnosis}
                      onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })}
                    >
                      {diagnosisSelectOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                    {editForm.diagnosis === "Other" && (
                      <input
                        className="inp"
                        style={{ marginTop: 8 }}
                        placeholder="Specify diagnosis"
                        value={editForm.diagnosis_other}
                        onChange={(e) => setEditForm({ ...editForm, diagnosis_other: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <label className="lbl">Consultant</label>
                    <select
                      className="inp"
                      value={editForm.consultant}
                      onChange={(e) => setEditForm({ ...editForm, consultant: e.target.value })}
                    >
                      {consultantSelectOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="actions bar">
                  <button className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={saveEdit} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </>
            )
          )}
        </section>
      )}
    </>
  );
}
