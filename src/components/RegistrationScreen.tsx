import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import PrintSlip from "./PrintSlip";
import { printSlip } from "../lib/printSlip";

type SyncState = "Offline" | "Ready to sync" | "Syncing..." | "Synced" | "Sync failed";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validateAge(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  if (!v) return "Age is required.";
  if (/^\d{1,3}$/.test(v)) {
    const y = Number(v);
    return y >= 0 && y <= 120 ? null : "Age must be between 0 and 120 years.";
  }
  const m = v.match(/^(\d{1,3})\s*Y(?:\s*(\d{1,2})\s*M)?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = m[2] ? Number(m[2]) : 0;
    if (y > 120 || (y === 120 && mo > 0)) return "Age must be between 0 and 120 years.";
    if (mo > 11) return "Months must be 0–11.";
    return null;
  }
  return "Enter age in years (e.g. 34) or infant format (e.g. 0Y 8M).";
}

function parseAge(raw: string): { years: number; months: number } | null {
  const v = raw.trim().toUpperCase();
  if (/^\d{1,3}$/.test(v)) {
    return { years: Number(v), months: 0 };
  }
  const m = v.match(/^(\d{1,3})\s*Y(?:\s*(\d{1,2})\s*M)?$/);
  if (m) {
    return { years: Number(m[1]), months: m[2] ? Number(m[2]) : 0 };
  }
  return null;
}

// Both Aadhaar and Mobile are optional at an OPD desk — a patient may not
// have their card, may be a minor, or the desk may simply be moving fast.
// Format is only checked when a value is actually entered; an empty field
// never blocks registration.
function validateAadhaar(raw: string): string | null {
  if (!raw.trim()) return null;
  const digits = raw.replace(/\s/g, "");
  return /^\d{12}$/.test(digits) ? null : "Aadhaar number must be 12 digits.";
}

function validateMobile(raw: string): string | null {
  if (!raw.trim()) return null;
  const digits = raw.replace(/\s/g, "");
  return /^\d{10}$/.test(digits) ? null : "Mobile number must be 10 digits.";
}

export default function RegistrationScreen({
  employee,
  onLogout,
  onBack,
  onNavigateHistory,
}: {
  employee: string;
  onLogout: () => void;
  onBack: () => void;
  onNavigateHistory: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const dateStr = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;

  const [sync, setSync] = useState<SyncState>("Offline");
  const lastSynced = `${dateStr} 18:42`;

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [addrOpen, setAddrOpen] = useState(false);
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [otherDiagnosis, setOtherDiagnosis] = useState("");
  const [department, setDepartment] = useState("");
  const [consultant, setConsultant] = useState("");
  const addrRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Remembers the Diagnosis value at the moment the field is focused, so
  // it can be restored on blur if the user opened the dropdown just to
  // look (or backed out) without picking anything — see diagOnFocus below.
  const diagnosisFocusValueRef = useRef("");

  type FieldKey =
    | "name"
    | "age"
    | "gender"
    | "address"
    | "aadhaarNumber"
    | "mobileNumber"
    | "diagnosis"
    | "otherDiagnosis"
    | "department"
    | "consultant";
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saved, setSaved] = useState<PatientData | null>(null);

  // "Other" is a UI-only sentinel for free-text diagnosis entry, not a
  // manageable master-data row — appended client-side after the real,
  // admin-managed list loads. Diagnoses/consultants used to be hardcoded
  // here; they're now fetched so Admin's master-data changes take effect
  // without a rebuild.
  const [diagnosisOptions, setDiagnosisOptions] = useState<string[]>([]);
  const [consultantOptions, setConsultantOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.electron.db
      .getDiagnoses()
      .then((list) => {
        if (!cancelled) setDiagnosisOptions([...list, "Other"]);
      })
      .catch((err) => console.error("[Registration] Failed to load diagnoses:", err));
    window.electron.db
      .getConsultants()
      .then((list) => {
        if (!cancelled) setConsultantOptions(list);
      })
      .catch((err) => console.error("[Registration] Failed to load consultants:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Departments mapped to the selected Diagnosis — empty until a diagnosis
  // with at least one mapped department is chosen. Most real diagnoses
  // currently have no department mapping (see Admin > Diagnoses), which is
  // why the Consultant field below falls back to the full flat list
  // whenever this is empty, rather than ever blocking registration.
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!diagnosis) {
      setDepartmentOptions([]);
      return;
    }
    let cancelled = false;
    window.electron.db
      .getDepartmentsForDiagnosis(diagnosis)
      .then((list) => {
        if (!cancelled) setDepartmentOptions(list);
      })
      .catch((err) => console.error("[Registration] Failed to load departments:", err));
    return () => {
      cancelled = true;
    };
  }, [diagnosis]);

  // Consultants mapped to the selected Department — only consulted when
  // the current diagnosis actually has departments (departmentOptions.length
  // > 0); otherwise the Consultant field uses the flat consultantOptions
  // list exactly as before this feature existed.
  const [departmentConsultantOptions, setDepartmentConsultantOptions] = useState<string[]>([]);
  const hasDepartmentChain = departmentOptions.length > 0;

  useEffect(() => {
    if (!hasDepartmentChain || !department) {
      setDepartmentConsultantOptions([]);
      return;
    }
    let cancelled = false;
    window.electron.db
      .getConsultantsForDepartment(department)
      .then((list) => {
        if (!cancelled) setDepartmentConsultantOptions(list);
      })
      .catch((err) => console.error("[Registration] Failed to load department consultants:", err));
    return () => {
      cancelled = true;
    };
  }, [hasDepartmentChain, department]);

  const effectiveConsultantOptions = hasDepartmentChain ? departmentConsultantOptions : consultantOptions;

  // Kick off loading the bundled Urdu header font as early as possible —
  // .print-slip is display:none on screen, so nothing visible ever needs
  // this font outside of an actual print, meaning the browser would
  // otherwise only discover/fetch it at print time. Starting the fetch on
  // mount gives it the whole time the employee spends filling the form to
  // finish, well before any print can occur.
  useEffect(() => {
    document.fonts.load('16pt "Noto Nastaliq Urdu"').catch(() => undefined);
  }, []);

  // Fires only after React has committed the DOM update reflecting the new
  // `saved` value, so the hidden PrintSlip already shows the correct patient
  // before printing captures the page — calling print() synchronously right
  // after setSaved() would risk printing stale/empty content.
  useEffect(() => {
    if (saved) {
      printSlip();
    }
  }, [saved]);

  // Preview of the OPD number that will be assigned on save. Read-only —
  // sourced from the backend, never computed here. The number actually
  // persisted always comes from registerPatient()'s own return value.
  const [previewOpd, setPreviewOpd] = useState<string | null>(null);

  useEffect(() => {
    if (saved) return;
    let cancelled = false;
    window.electron.db
      .previewNextOpdNumber()
      .then((opd) => {
        if (!cancelled) setPreviewOpd(opd);
      })
      .catch((error) => {
        console.error("[Registration] Failed to preview OPD number:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [saved]);

  // Check for duplicate patient (by name + age)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    opdNo: string;
    name: string;
  } | null>(null);

  // Get returning patient address
  const [returningAddress, setReturningAddress] = useState<string | null>(null);

  // Check duplicate when name/age changes
  useEffect(() => {
    const checkForDuplicate = async () => {
      const nameTrimmed = name.trim();
      const ageParsed = parseAge(age);

      if (nameTrimmed.length < 3 || !ageParsed) {
        setDuplicateWarning(null);
        setReturningAddress(null);
        return;
      }

      try {
        const result = await window.electron.db.checkDuplicate(
          nameTrimmed,
          ageParsed.years
        );

        if (result.isDuplicate && result.existingPatient) {
          setDuplicateWarning({
            opdNo: result.existingPatient.opd_no,
            name: result.existingPatient.patient_name,
          });

          // Get the returning patient's address
          const returnAddr = await window.electron.db.getReturningPatientAddress(
            nameTrimmed
          );
          setReturningAddress(returnAddr);
        } else {
          setDuplicateWarning(null);
          setReturningAddress(null);
        }
      } catch (error) {
        console.error("[Registration] Duplicate check failed:", error);
        setDuplicateWarning(null);
      }
    };

    const timer = setTimeout(checkForDuplicate, 300);
    return () => clearTimeout(timer);
  }, [name, age]);

  useEffect(() => {
    if (sync !== "Syncing...") return;
    const t = setTimeout(() => setSync("Synced"), 900);
    return () => clearTimeout(t);
  }, [sync]);

  function reset() {
    setName("");
    setAge("");
    setGender("");
    setAddress("");
    setAadhaarNumber("");
    setMobileNumber("");
    setDiagnosis("");
    setOtherDiagnosis("");
    setDepartment("");
    setConsultant("");
    setErrors({});
    setAddrOpen(false);
    setDuplicateWarning(null);
    setReturningAddress(null);
  }

  function genderKeys(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key.toLowerCase();
    if (k === "m") setGender("Male");
    else if (k === "f") setGender("Female");
    else if (k === "c") setGender("Child");
    else if (k === "o") setGender("Other");
    else return;
    e.preventDefault();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();

    const err: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) err.name = "Patient name is required.";
    const ageErr = validateAge(age);
    if (ageErr) err.age = ageErr;
    if (!gender) err.gender = "Select gender.";
    if (!address.trim()) err.address = "Address is required.";
    const aadhaarErr = validateAadhaar(aadhaarNumber);
    if (aadhaarErr) err.aadhaarNumber = aadhaarErr;
    const mobileErr = validateMobile(mobileNumber);
    if (mobileErr) err.mobileNumber = mobileErr;
    if (!diagnosis.trim()) err.diagnosis = "Select a diagnosis.";
    if (diagnosis === "Other" && !otherDiagnosis.trim())
      err.otherDiagnosis = "Specify the diagnosis.";
    // Department is only required when this diagnosis actually has
    // departments mapped (hasDepartmentChain) — most diagnoses don't yet,
    // and registration must keep working exactly as before for those.
    if (hasDepartmentChain && !department) err.department = "Select a department.";
    if (!consultant) err.consultant = "Select a consultant.";

    setErrors(err);
    if (Object.keys(err).length) return;

    // Parse age
    const ageParsed = parseAge(age);
    if (!ageParsed) {
      setErrors({ ...err, age: "Invalid age format" });
      return;
    }

    setIsSaving(true);
    try {
      // Register patient in the database
      const patient = await window.electron.db.registerPatient({
        registration_date: dateStr,
        patient_name: name.trim(),
        age_years: ageParsed.years,
        age_months: ageParsed.months,
        gender,
        address: address.trim(),
        diagnosis,
        consultant,
        employee_id: employee,
        ...(aadhaarNumber.trim() ? { aadhaar_number: aadhaarNumber.trim() } : {}),
        ...(mobileNumber.trim() ? { mobile_number: mobileNumber.trim() } : {}),
        ...(diagnosis === "Other" ? { diagnosis_other: otherDiagnosis.trim() } : {}),
        ...(hasDepartmentChain && department ? { department } : {}),
      });

      setSaved(patient);
      setSync("Ready to sync");
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Registration] Save failed:", message);
      setErrors({
        ...err,
        name: `Save failed: ${message}`,
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <strong className="appbar-title">Unani Hospital</strong>
          <span className="appbar-pipe" aria-hidden="true">
            |
          </span>
          <span className="appbar-sub">OPD Management System</span>
        </div>
        <div className="appbar-right">
          <span className={`sync sync-${sync.replace(/[^a-z]/gi, "").toLowerCase()}`}>
            <span className="sdot" aria-hidden="true" />
            {sync}
          </span>
          <span className="meta small">Last synced: {lastSynced}</span>
          <button
            className="btn-ghost"
            onClick={() => setSync("Syncing...")}
            disabled={sync === "Syncing..."}
          >
            Sync to Server
          </button>
          <span className="dot" aria-hidden="true" />
          <button className="btn-ghost" onClick={onNavigateHistory} title="Opens records search">
            Search Records
          </button>
          <span className="dot" aria-hidden="true" />
          <button className="btn-ghost" onClick={onBack}>
            Back to Dashboard
          </button>
          <span className="dot" aria-hidden="true" />
          <span className="meta">Employee {employee}</span>
          <button className="btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="page">
        {saved ? (
          <section className="panel success">
            <h2 className="panel-title">✓ Patient registered successfully</h2>
            <div className="opd-result">
              <div className="opd-result-label">C.R. No.</div>
              <div className="opd-result-value">{saved.opd_no}</div>
            </div>
            <div className="detail-row">
              <span className="lbl">Patient Name</span>
              <div className="detail-value">{saved.patient_name}</div>
            </div>
            <p className="succ-note">Slip sent to printer.</p>
            <div className="actions">
              <button className="btn-secondary" onClick={printSlip}>
                Print OPD Slip
              </button>
              <button
                className="btn-primary"
                autoFocus
                onClick={() => {
                  reset();
                  setSaved(null);
                }}
              >
                New Registration
              </button>
            </div>
          </section>
        ) : (
          <form className="panel" onSubmit={submit}>
            <h2 className="panel-title">New OPD Registration</h2>

            <div className="opd-result">
              <div className="opd-result-label">C.R. No.</div>
              <div className="opd-result-value">{previewOpd ?? "—"}</div>
            </div>

            <div className="grid">
              <div className="field">
                <label className="lbl" htmlFor="pname">
                  Patient Name <span className="req">*</span>
                </label>
                <input
                  id="pname"
                  className="inp"
                  autoFocus
                  lang="hi"
                  placeholder="Name in English or हिन्दी"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && <p className="err">{errors.name}</p>}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="age">
                  Age <span className="req">*</span>
                </label>
                <input
                  id="age"
                  className="inp narrow"
                  placeholder="e.g. 34  or  0Y 8M"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                />
                {errors.age ? (
                  <p className="err">{errors.age}</p>
                ) : (
                  <p className="hint">Years (0–120) or infant format 0Y 8M</p>
                )}
              </div>

              <div className="field">
                <span className="lbl">
                  Gender <span className="req">*</span>
                </span>
                <div className="radios" onKeyDown={genderKeys}>
                  {["Male", "Female", "Child", "Other"].map((g) => (
                    <label key={g} className="radio">
                      <input
                        type="radio"
                        name="gender"
                        value={g}
                        checked={gender === g}
                        onChange={() => setGender(g)}
                      />
                      <span>{g}</span>
                    </label>
                  ))}
                </div>
                {errors.gender && <p className="err">{errors.gender}</p>}
              </div>

              {duplicateWarning && returningAddress && (
                <div className="span2 existing">
                  <div className="existing-txt">
                    <strong>Returning patient detected</strong>
                    <span className="meta-line">
                      {duplicateWarning.name} — <span className="opd-chip">{duplicateWarning.opdNo}</span>
                    </span>
                    <span className="meta-line dim">Previous address available</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary sm"
                    onClick={() => setAddress(returningAddress)}
                  >
                    Use Existing Details
                  </button>
                </div>
              )}

              <div className="field span2">
                <label className="lbl" htmlFor="addr">
                  Address <span className="req">*</span>
                </label>
                <textarea
                  id="addr"
                  ref={addrRef}
                  className="inp ta"
                  rows={2}
                  autoComplete="off"
                  placeholder="Village / Mohalla, Tehsil, District, PIN (optional)"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                {errors.address && <p className="err">{errors.address}</p>}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="aadhaar">
                  Aadhaar Number
                </label>
                <input
                  id="aadhaar"
                  className="inp"
                  inputMode="numeric"
                  placeholder="12-digit Aadhaar (optional)"
                  value={aadhaarNumber}
                  onChange={(e) => setAadhaarNumber(e.target.value)}
                />
                {errors.aadhaarNumber && <p className="err">{errors.aadhaarNumber}</p>}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="mobile">
                  Mobile Number
                </label>
                <input
                  id="mobile"
                  className="inp"
                  inputMode="numeric"
                  placeholder="10-digit mobile (optional)"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                />
                {errors.mobileNumber && <p className="err">{errors.mobileNumber}</p>}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="diag">
                  Diagnosis <span className="req">*</span>
                </label>
                <input
                  id="diag"
                  className="inp"
                  list="diag-list"
                  autoComplete="off"
                  placeholder="Type to search (e.g. Nazla, Humma, Falij)"
                  value={diagnosis}
                  onFocus={() => {
                    // A datalist popup filters its suggestions against the
                    // input's CURRENT text — with the previous selection
                    // still filled in, reopening the field shows only that
                    // one exact match. Clearing on focus makes the full
                    // list visible immediately; onBlur restores the prior
                    // value if the user backs out without picking a new
                    // one (diagnosis is still empty at that point since
                    // nothing was typed/selected).
                    diagnosisFocusValueRef.current = diagnosis;
                    if (diagnosis) setDiagnosis("");
                  }}
                  onBlur={() => {
                    if (!diagnosis && diagnosisFocusValueRef.current) {
                      setDiagnosis(diagnosisFocusValueRef.current);
                    }
                  }}
                  onChange={(e) => {
                    setDiagnosis(e.target.value);
                    setDepartment("");
                    setConsultant("");
                  }}
                />
                <datalist id="diag-list">
                  {diagnosisOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                {errors.diagnosis && <p className="err">{errors.diagnosis}</p>}
                {diagnosis === "Other" && (
                  <div className="sub-field">
                    <label className="lbl" htmlFor="odiag">
                      Specify diagnosis <span className="req">*</span>
                    </label>
                    <input
                      id="odiag"
                      className="inp"
                      value={otherDiagnosis}
                      onChange={(e) => setOtherDiagnosis(e.target.value)}
                    />
                    {errors.otherDiagnosis && <p className="err">{errors.otherDiagnosis}</p>}
                  </div>
                )}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="dept">
                  Department {hasDepartmentChain && <span className="req">*</span>}
                </label>
                <select
                  id="dept"
                  className="inp"
                  value={department}
                  disabled={!hasDepartmentChain}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setConsultant("");
                  }}
                >
                  <option value="">
                    {!diagnosis
                      ? "Select diagnosis first"
                      : hasDepartmentChain
                        ? "Select department"
                        : "No departments configured for this diagnosis"}
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {errors.department && <p className="err">{errors.department}</p>}
              </div>

              <div className="field">
                <label className="lbl" htmlFor="cons">
                  Consultant Name <span className="req">*</span>
                </label>
                <select
                  id="cons"
                  className="inp"
                  value={consultant}
                  disabled={hasDepartmentChain && !department}
                  onChange={(e) => setConsultant(e.target.value)}
                >
                  <option value="">
                    {hasDepartmentChain && !department ? "Select department first" : "Select consultant"}
                  </option>
                  {effectiveConsultantOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {errors.consultant && <p className="err">{errors.consultant}</p>}
              </div>
            </div>

            <div className="actions bar">
              <button type="button" className="btn-secondary" onClick={reset} disabled={isSaving}>
                Clear
              </button>
              <button type="submit" className="btn-primary" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save & Print"}
              </button>
            </div>
          </form>
        )}
      </main>

      <PrintSlip patient={saved} />
    </div>
  );
}
