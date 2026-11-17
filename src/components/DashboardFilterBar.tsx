import { useEffect, useState } from "react";

export interface DashboardFilterValue {
  gender: string;
  department: string;
  consultant: string;
}

export const EMPTY_DASHBOARD_FILTER: DashboardFilterValue = { gender: "", department: "", consultant: "" };

// Shared by Employee Dashboard and Admin Dashboard — the same Gender /
// Department / Consultant filter row, with the same Department -> Consultant
// dependency used everywhere else in the app (Registration, Admin Patients
// edit): reuses getDepartments()/getConsultantsForDepartment(), never a new
// relationship system. Unlike those registration-form usages, Consultant
// here is never disabled while Department is empty — a filter should be
// usable standalone ("a specific consultant only" is an explicit required
// case), so with no Department selected this falls back to the full
// getConsultants() list instead.
export default function DashboardFilterBar({
  value,
  onChange,
}: {
  value: DashboardFilterValue;
  onChange: (next: DashboardFilterValue) => void;
}) {
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [consultantOptions, setConsultantOptions] = useState<string[]>([]);

  useEffect(() => {
    window.electron.db.getDepartments().then(setDepartmentOptions).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loader = value.department
      ? window.electron.db.getConsultantsForDepartment(value.department)
      : window.electron.db.getConsultants();
    loader
      .then((list) => {
        if (cancelled) return;
        setConsultantOptions(list);
        // Changing/clearing Department clears a Consultant selection that
        // no longer belongs to the (new) list — restores the appropriate
        // options rather than silently keeping a stale, invalid filter.
        if (value.consultant && !list.includes(value.consultant)) {
          onChange({ ...value, consultant: "" });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.department]);

  const hasActiveFilter = !!(value.gender || value.department || value.consultant);

  return (
    <div className="search-bar filter-bar">
      <div className="search-field">
        <label className="lbl" htmlFor="filter-gender">
          Gender
        </label>
        <select
          id="filter-gender"
          className="inp"
          value={value.gender}
          onChange={(e) => onChange({ ...value, gender: e.target.value })}
        >
          <option value="">All</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Child">Child</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div className="search-field">
        <label className="lbl" htmlFor="filter-department">
          Department
        </label>
        <select
          id="filter-department"
          className="inp"
          value={value.department}
          onChange={(e) => onChange({ ...value, department: e.target.value })}
        >
          <option value="">All</option>
          {departmentOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <div className="search-field">
        <label className="lbl" htmlFor="filter-consultant">
          Consultant
        </label>
        <select
          id="filter-consultant"
          className="inp"
          value={value.consultant}
          onChange={(e) => onChange({ ...value, consultant: e.target.value })}
        >
          <option value="">All</option>
          {consultantOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {hasActiveFilter && (
        <div className="search-field">
          <button type="button" className="btn-secondary" onClick={() => onChange(EMPTY_DASHBOARD_FILTER)}>
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
