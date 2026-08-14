import { useEffect, useState, type FormEvent } from "react";
import AppHeader from "./AppHeader";

// Convert a native <input type="date"> value (YYYY-MM-DD) to the
// DD/MM/YYYY format used for registration_date. Pure string manipulation —
// no Date object, no timezone conversion, no off-by-one risk.
function isoToRegistrationDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type EditForm = {
  address: string;
  diagnosis: string;
  diagnosisOther: string;
  consultant: string;
};

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

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [diagnosesList, setDiagnosesList] = useState<string[]>([]);
  const [consultantsList, setConsultantsList] = useState<string[]>([]);

  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    window.electron.db.getDiagnoses().then(setDiagnosesList).catch(() => undefined);
    window.electron.db.getConsultants().then(setConsultantsList).catch(() => undefined);
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
    setEditing(false);
    setConfirmingDelete(false);
    setNotice(null);
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
    setEditing(false);
    setConfirmingDelete(false);
    setDetailError(null);
  }

  function startEdit() {
    if (!selected) return;
    setEditForm({
      address: selected.address,
      diagnosis: selected.diagnosis,
      diagnosisOther: selected.diagnosis_other ?? "",
      consultant: selected.consultant,
    });
    setEditing(true);
    setConfirmingDelete(false);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!selected || !editForm) return;

    setIsSaving(true);
    setDetailError(null);
    try {
      const updated = await window.electron.db.updatePatient(selected.id as number, {
        address: editForm.address.trim(),
        diagnosis: editForm.diagnosis,
        diagnosis_other: editForm.diagnosis === "Other" ? editForm.diagnosisOther.trim() : undefined,
        consultant: editForm.consultant,
      });
      setSelected(updated);
      setEditing(false);
      setNotice("Patient record updated.");
      runSearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[History] updatePatient failed:", message);
      setDetailError(`Update failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!selected) return;
    setIsDeleting(true);
    setDetailError(null);
    try {
      await window.electron.db.softDeletePatient(selected.id as number);
      setNotice(`${selected.opd_no} was removed from active records.`);
      closeDetail();
      runSearch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[History] softDeletePatient failed:", message);
      setDetailError(`Delete failed: ${message}`);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="app">
      <AppHeader
        employee={employee}
        onLogout={onLogout}
        subtitle="Patient History"
        right={
          <button className="btn-ghost" onClick={onBack}>
            Back to Dashboard
          </button>
        }
      />

      <main className="page">
        <section className="panel">
          <h2 className="panel-title">Patient History / Search</h2>

          {notice && <p className="succ-note">{notice}</p>}

          <form className="search-bar" onSubmit={submitSearch}>
            <div className="search-field">
              <label className="lbl" htmlFor="hist-query">
                Name or OPD No.
              </label>
              <input
                id="hist-query"
                className="inp"
                placeholder="e.g. abc or OPD-2026-00001"
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
                  <th>OPD No.</th>
                  <th>Patient Name</th>
                  <th>Age</th>
                  <th>Gender</th>
                  <th>Diagnosis</th>
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
                    <td>{r.diagnosis}</td>
                    <td>{r.registration_date}</td>
                    <td>{r.consultant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {selected && (
          <section className="panel detail-panel">
            <h2 className="panel-title">
              <span className="opd-label">OPD No.</span>
              <span className="opd-chip">{selected.opd_no}</span>
              {" — "}
              {selected.patient_name}
            </h2>

            {detailError && <p className="err">{detailError}</p>}

            {!editing ? (
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
                  {!confirmingDelete ? (
                    <>
                      <button className="btn-secondary" onClick={closeDetail}>
                        Close
                      </button>
                      <button className="btn-secondary" onClick={() => setConfirmingDelete(true)}>
                        Delete
                      </button>
                      <button className="btn-primary" onClick={startEdit}>
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="meta-line dim">Remove this patient from active records?</span>
                      <button className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={isDeleting}>
                        Cancel
                      </button>
                      <button className="btn-primary" onClick={confirmDelete} disabled={isDeleting}>
                        {isDeleting ? "Removing..." : "Confirm Delete"}
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              editForm && (
                <form onSubmit={saveEdit}>
                  <div className="grid">
                    <div className="field span2">
                      <label className="lbl" htmlFor="edit-address">
                        Address
                      </label>
                      <textarea
                        id="edit-address"
                        className="inp ta"
                        rows={2}
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label className="lbl" htmlFor="edit-diag">
                        Diagnosis
                      </label>
                      <input
                        id="edit-diag"
                        className="inp"
                        list="edit-diag-list"
                        value={editForm.diagnosis}
                        onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })}
                      />
                      <datalist id="edit-diag-list">
                        {diagnosesList.map((d) => (
                          <option key={d} value={d} />
                        ))}
                      </datalist>
                      {editForm.diagnosis === "Other" && (
                        <div className="sub-field">
                          <label className="lbl" htmlFor="edit-odiag">
                            Specify diagnosis
                          </label>
                          <input
                            id="edit-odiag"
                            className="inp"
                            value={editForm.diagnosisOther}
                            onChange={(e) => setEditForm({ ...editForm, diagnosisOther: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                    <div className="field">
                      <label className="lbl" htmlFor="edit-cons">
                        Consultant Name
                      </label>
                      <select
                        id="edit-cons"
                        className="inp"
                        value={editForm.consultant}
                        onChange={(e) => setEditForm({ ...editForm, consultant: e.target.value })}
                      >
                        {consultantsList.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="actions bar">
                    <button type="button" className="btn-secondary" onClick={() => setEditing(false)} disabled={isSaving}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary" disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              )
            )}
          </section>
        )}
      </main>
    </div>
  );
}
