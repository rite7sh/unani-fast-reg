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

const ADDRESS_HISTORY = [
  "Mohalla Qaziyan, Tehsil Sadar, District Aligarh, 202001",
  "Village Nagla Mansur, Tehsil Iglas, District Aligarh, 202124",
  "Mohalla Shah Jamal, Tehsil Koil, District Aligarh, 202002",
  "Village Barauli, Tehsil Atrauli, District Aligarh, 202280",
  "Mohalla Turkman Gate, Tehsil Sadar, District Aligarh, 202001",
  "Village Chherat, Tehsil Khair, District Aligarh, 202138",
];

const KNOWN_PATIENTS = [
  { name: "Mohd. Aslam", age: "46", address: "Mohalla Qaziyan, Tehsil Sadar, District Aligarh, 202001" },
  { name: "Rukhsana Begum", age: "32", address: "Village Nagla Mansur, Tehsil Iglas, District Aligarh, 202124" },
  { name: "Ram Singh", age: "58", address: "Village Barauli, Tehsil Atrauli, District Aligarh, 202280" },
];

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

type Saved = { opd: string; name: string };

export default function RegistrationScreen({
  employee,
  onLogout,
}: {
  employee: string;
  onLogout: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const dateStr = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()}`;
  const [seq, setSeq] = useState(423);
  const opdNo = `OPD-${today.getFullYear()}-${String(seq).padStart(5, "0")}`;

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

  const addrSuggestions = useMemo(() => {
    const q = address.trim().toLowerCase();
    if (q.length < 3) return [];
    return ADDRESS_HISTORY.filter((a) => a.toLowerCase().includes(q)).slice(0, 4);
  }, [address]);

  const match = useMemo(() => {
    const n = name.trim().toLowerCase();
    const a = age.trim();
    if (n.length < 3 || !a) return null;
    return (
      KNOWN_PATIENTS.find((p) => p.name.toLowerCase() === n && p.age === a) ?? null
    );
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
  }

  function genderKeys(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key.toLowerCase();
    if (k === "m") setGender("Male");
    else if (k === "f") setGender("Female");
    else if (k === "o") setGender("Other");
    else return;
    e.preventDefault();
  }

  function submit(e: FormEvent) {
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

    setSaved({ opd: opdNo, name: name.trim() });
    setSeq((s) => s + 1);
    setSync("Ready to sync");
    window.print?.();
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
          <button className="btn-ghost" onClick={() => undefined} title="Opens records search">
            Search Records
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
              <strong>{saved.opd}</strong> — {saved.name}
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
                <label className="lbl" htmlFor="opd">
                  OPD Registration No.
                </label>
                <input id="opd" className="inp ro" value={opdNo} readOnly tabIndex={-1} />
                <p className="hint">Automatically generated</p>
              </div>
              <div className="field">
                <label className="lbl" htmlFor="date">
                  Date
                </label>
                <input id="date" className="inp ro" value={dateStr} readOnly tabIndex={-1} />
                <p className="hint">System date</p>
              </div>

              <div className="field span2">
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

              {match && (
                <div className="span2 existing">
                  <div className="existing-txt">
                    <strong>Existing patient found</strong>
                    <span className="meta-line">
                      {match.name} · {match.age}
                    </span>
                    <span className="meta-line dim">Previous address available</span>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary sm"
                    onClick={() => setAddress(match.address)}
                  >
                    Use Existing Details
                  </button>
                </div>
              )}

              <div className="field span2">
                <label className="lbl" htmlFor="addr">
                  Address <span className="req">*</span>
                </label>
                <div className="ac-wrap">
                  <textarea
                    id="addr"
                    ref={addrRef}
                    className="inp ta"
                    rows={2}
                    autoComplete="off"
                    placeholder="Village / Mohalla, Tehsil, District, PIN (optional)"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setAddrOpen(true);
                    }}
                    onFocus={() => setAddrOpen(true)}
                    onBlur={() => window.setTimeout(() => setAddrOpen(false), 120)}
                  />
                  {addrOpen && addrSuggestions.length > 0 && (
                    <ul className="ac-list">
                      {addrSuggestions.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            className="ac-item"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setAddress(s);
                              setAddrOpen(false);
                              addrRef.current?.focus();
                            }}
                          >
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
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
              <button type="button" className="btn-secondary" onClick={reset}>
                Clear
              </button>
              <button type="submit" className="btn-primary">
                Save &amp; Print
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
