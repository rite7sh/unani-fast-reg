// Dedicated print-only OPD slip. Hidden on screen; shown only under
// @media print (see styles.css). Renders nothing until a real, persisted
// patient record exists — never fabricates or recomputes values.
export default function PrintSlip({ patient }: { patient: PatientData | null }) {
  if (!patient) return null;

  const ageSex = `${patient.age_years}Y${patient.age_months ? ` ${patient.age_months}M` : ""} / ${patient.gender}`;
  const diagnosisText =
    patient.diagnosis === "Other" && patient.diagnosis_other
      ? patient.diagnosis_other
      : patient.diagnosis;

  return (
    <div className="print-slip">
      <div className="print-slip-header">
        <div className="print-slip-urdu" dir="rtl" lang="ur">
          حکیم سید ضیاء الحسن گورمینٹ (خود مختار) یونانی میڈیکل کالج و اسپتال، بھوپال
        </div>
        <div className="print-slip-hindi" lang="hi">
          हकीम सैय्यद ज़ियाउल-हसन शासकीय/स्वशासी यूनानी चिकित्सा महाविद्यालय एवं चिकित्सालय, भोपाल
        </div>
      </div>
      <div className="print-slip-rule" />

      <div className="print-slip-fields">
        <div className="print-slip-row">
          <span className="print-slip-field ps-opd">
            <span className="print-slip-lbl">C.R. No.</span>
            <span className="print-slip-val ps-opd-val">{patient.opd_no}</span>
          </span>
          <span className="print-slip-field ps-date">
            <span className="print-slip-lbl">Date</span>
            <span className="print-slip-val">{patient.registration_date}</span>
          </span>
        </div>

        <div className="print-slip-row">
          <span className="print-slip-field ps-name">
            <span className="print-slip-lbl">Name</span>
            <span className="print-slip-val">{patient.patient_name}</span>
          </span>
          <span className="print-slip-field ps-agesex">
            <span className="print-slip-lbl">Age/Sex</span>
            <span className="print-slip-val">{ageSex}</span>
          </span>
        </div>

        <div className="print-slip-row">
          <span className="print-slip-field ps-address">
            <span className="print-slip-lbl">Address</span>
            <span className="print-slip-val">{patient.address}</span>
          </span>
        </div>

        <div className="print-slip-row">
          <span className="print-slip-field ps-diagnosis">
            <span className="print-slip-lbl">Diagnosis</span>
            <span className="print-slip-val">{diagnosisText}</span>
          </span>
          <span className="print-slip-field ps-consultant">
            <span className="print-slip-lbl">Consultant</span>
            <span className="print-slip-val">{patient.consultant}</span>
          </span>
        </div>
      </div>

      {/* Intentionally blank — reserved for the consultant's handwritten
          notes, examination findings, and treatment. */}
      <div className="print-slip-blank" />

      <div className="print-slip-footer">
        पता: आयुष परिसर, विज्ञान पहाड़ी मैनिट के पीछे, नेहरू नगर, कोलार बायपास रोड, भोपाल
      </div>
    </div>
  );
}
