import { useMemo, useState, type FormEvent } from "react";

const DIAGNOSES = [
  "Nazla Zukam (Common Cold)",
  "Suaal (Cough / Bronchitis)",
  "Zeequn Nafas (Asthma)",
  "Waja-ul-Mafasil (Arthritis)",
  "Waja-ul-Zahr (Backache)",
  "Zof-e-Meda (Dyspepsia)",
  "Qabz (Constipation)",
  "Zayabetus (Diabetes Mellitus)",
  "Zaghtud Dam Qawi (Hypertension)",
  "Bawaseer (Piles)",
  "Da-us-Sadaf (Psoriasis)",
  "Humma (Fever)",
  "Other",
];

const CONSULTANTS = [
  "Dr. A. R. Ansari — Senior Consultant (Moalajat)",
  "Dr. S. Fatima — Consultant (Amraz-e-Niswan)",
  "Dr. M. Iqbal — Consultant (Ilaj-bit-Tadbeer)",
  "Dr. K. Rahman — Medical Officer (General OPD)",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
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

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [otherDiagnosis, setOtherDiagnosis] = useState("");
  const [consultant, setConsultant] = useState("");
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

  function reset() {
    setName("");
    setAge("");
    setGender("");
    setAddress("");
    setDiagnosis("");
    setOtherDiagnosis("");
    setConsultant("");
    setErrors({});
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const err: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) err.name = "Patient name is required.";
    if (!age.trim()) err.age = "Age is required.";
    if (!gender) err.gender = "Select gender.";
    if (!address.trim()) err.address = "Address is required.";
    if (!diagnosis) err.diagnosis = "Select a diagnosis.";
    if (diagnosis === "Other" && !otherDiagnosis.trim())
      err.otherDiagnosis = "Specify the diagnosis.";
    if (!consultant) err.consultant = "Select a consultant.";
    setErrors(err);
    if (Object.keys(err).length) return;

    setSaved({ opd: opdNo, name: name.trim() });
    setSeq((s) => s + 1);
    window.print?.();
  }

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-left">
          <strong className="appbar-title">Unani Hospital</strong>
          <span className="appbar-sub">OPD Management System</span>
        </div>
        <div className="appbar-right">
          <span className="meta">{dateStr}</span>
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
            <h2 className="panel-title">Patient registered successfully</h2>
            <p className="succ-line">
              OPD No. <strong>{saved.opd}</strong> — {saved.name}
            </p>
            <p className="succ-note">Slip sent to printer.</p>
            <div className="actions">
              <button className="btn-secondary" onClick={() => window.print?.()}>
                Print Again
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
              </div>
              <div className="field">
                <label className="lbl" htmlFor="date">
                  Date
                </label>
                <input id="date" className="inp ro" value={dateStr} readOnly tabIndex={-1} />
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
                {errors.age && <p className="err">{errors.age}</p>}
              </div>

              <div className="field">
                <span className="lbl">
                  Gender <span className="req">*</span>
                </span>
                <div className="radios">
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

              <div className="field span2">
                <label className="lbl" htmlFor="addr">
                  Address <span className="req">*</span>
                </label>
                <textarea
                  id="addr"
                  className="inp ta"
                  rows={2}
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
                  placeholder="Type to search"
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
