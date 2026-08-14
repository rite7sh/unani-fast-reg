import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

const DIAGNOSES = [
  "Nazla (Coryza)",
  "Zukam (Common Cold)",
  "Suaal (Cough)",
  "Zeequn Nafas (Asthma)",
  "Zaat-ur-Riya (Pneumonia)",
  "Sil (Tuberculosis)",
  "Humma (Fever)",
  "Humma Muhriqa (High Fever)",
  "Humma Diqqiya (Hectic Fever)",
  "Waram (Inflammation)",
  "Waram-e-Halq (Pharyngitis)",
  "Waram-e-Lauzatain (Tonsillitis)",
  "Waram-e-Kabid (Hepatitis)",
  "Waram-e-Kulya (Nephritis)",
  "Waram-e-Masana (Cystitis)",
  "Waja-ul-Mafasil (Arthritis)",
  "Niqras (Gout)",
  "Waja-ul-Zahr (Backache)",
  "Irqun Nasa (Sciatica)",
  "Waja-ur-Raqba (Cervical Pain)",
  "Falij (Paralysis)",
  "Laqwa (Facial Palsy)",
  "Raasha (Tremor)",
  "Sara (Epilepsy)",
  "Suda (Headache)",
  "Shaqiqa (Migraine)",
  "Dawar (Vertigo)",
  "Sahar (Insomnia)",
  "Malikholia (Melancholia)",
  "Bars (Vitiligo)",
  "Bahaq (Tinea Versicolor)",
  "Da-us-Sadaf (Psoriasis)",
  "Quba (Ringworm)",
  "Hikka (Pruritus)",
  "Shara (Urticaria)",
  "Busoor-e-Labaniya (Acne)",
  "Da-us-Salab (Alopecia Areata)",
  "Zof-e-Meda (Dyspepsia)",
  "Qabz (Constipation)",
  "Ishaal (Diarrhoea)",
  "Zaheer (Dysentery)",
  "Qai (Vomiting)",
  "Yarqan (Jaundice)",
  "Istisqa (Ascites)",
  "Bawaseer (Piles)",
  "Sheqaq-e-Maqad (Anal Fissure)",
  "Deedan-e-Ama (Intestinal Worms)",
  "Zayabetus (Diabetes Mellitus)",
  "Zaghtud Dam Qawi (Hypertension)",
  "Zaghtud Dam Zaeef (Hypotension)",
  "Faqrud Dam (Anaemia)",
  "Siman-e-Mufrit (Obesity)",
  "Zof-e-Qalb (Cardiac Weakness)",
  "Hasat-e-Kulya (Renal Calculi)",
  "Salasul Baul (Enuresis)",
  "Ihtebas-e-Baul (Urinary Retention)",
  "Su-e-Haiz (Menstrual Disorder)",
  "Usr-e-Tams (Dysmenorrhoea)",
  "Kasrat-e-Tams (Menorrhagia)",
  "Sailanur Rahm (Leucorrhoea)",
  "Zof-e-Basar (Weak Eyesight)",
  "Ramad (Conjunctivitis)",
  "Waja-ul-Uzn (Earache)",
  "Waja-ul-Asnan (Toothache)",
  "Other",
];

const CONSULTANTS = [
  "Dr. Mohd. Ashraf — BUMS",
  "Dr. A. R. Ansari — BUMS, MD (Moalajat)",
  "Dr. S. Fatima — BUMS, MD (Amraz-e-Niswan)",
  "Dr. M. Iqbal — BUMS, MD (Ilaj-bit-Tadbeer)",
  "Dr. K. Rahman — BUMS (General OPD)",
];

type SyncState = "Offline" | "Ready to sync" | "Syncing..." | "Synced" | "Sync failed";
type Saved = { opd: string; name: string };

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
  const [diagnosis, setDiagnosis] = useState("");
  const [otherDiagnosis, setOtherDiagnosis] = useState("");
  const [consultant, setConsultant] = useState("");
  const addrRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  type FieldKey =
    | "name"
    | "age"
    | "gender"
    | "address"
    | "diagnosis"
    | "otherDiagnosis"
    | "consultant";
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [saved, setSaved] = useState<Saved | null>(null);

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
    setDiagnosis("");
    setOtherDiagnosis("");
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
    if (!diagnosis.trim()) err.diagnosis = "Select a diagnosis.";
    if (diagnosis === "Other" && !otherDiagnosis.trim())
      err.otherDiagnosis = "Specify the diagnosis.";
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
        diagnosis_other: diagnosis === "Other" ? otherDiagnosis.trim() : undefined,
        consultant,
        employee_id: employee,
      });

      setSaved({ opd: patient.opd_no, name: patient.patient_name });
      setSync("Ready to sync");
      window.print?.();
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
          <span className="meta">{employee}</span>
          <button className="btn-ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="page">
        {saved ? (
          <section className="panel success">
            <h2 className="panel-title">✓ Patient registered successfully</h2>
            <p className="succ-line">
              <span className="opd-label">OPD No.</span>
              <strong className="opd-chip">{saved.opd}</strong> — {saved.name}
            </p>
            <p className="succ-note">Slip sent to printer.</p>
            <div className="actions">
              <button className="btn-secondary" onClick={() => window.print?.()}>
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
                  {["Male", "Female", "Other"].map((g) => (
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
                      {duplicateWarning.name} ({duplicateWarning.opdNo})
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
                  onChange={(e) => setDiagnosis(e.target.value)}
                />
                <datalist id="diag-list">
                  {DIAGNOSES.map((d) => (
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
                <label className="lbl" htmlFor="cons">
                  Consultant Name <span className="req">*</span>
                </label>
                <select
                  id="cons"
                  className="inp"
                  value={consultant}
                  onChange={(e) => setConsultant(e.target.value)}
                >
                  <option value="">Select consultant</option>
                  {CONSULTANTS.map((c) => (
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
    </div>
  );
}
