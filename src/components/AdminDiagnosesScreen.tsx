import { Fragment, useEffect, useState, type FormEvent } from "react";

export default function AdminDiagnosesScreen() {
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // Department mapping — which departments a diagnosis routes to. Loaded
  // once (the full department list, including inactive, so Admin can see
  // what's currently assigned even if a department was since deactivated);
  // per-diagnosis membership is fetched lazily on expand.
  const [departments, setDepartments] = useState<MasterDataItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<number[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    window.electron.admin
      .listDiagnoses()
      .then(setItems)
      .catch((err) => {
        console.error("[AdminDiagnoses] Failed to load:", err);
        setError("Could not load diagnoses.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    window.electron.admin.listDepartments().then(setDepartments).catch(() => undefined);
  }, []);

  async function toggleExpand(item: MasterDataItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setError(null);
    try {
      const ids = await window.electron.admin.getDiagnosisDepartments(item.id);
      setExpandedDepartmentIds(ids);
      setExpandedId(item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not load department mapping: ${message}`);
    }
  }

  function toggleDepartmentChecked(departmentId: number) {
    setExpandedDepartmentIds((prev) =>
      prev.includes(departmentId) ? prev.filter((id) => id !== departmentId) : [...prev, departmentId]
    );
  }

  async function saveMapping(diagnosisId: number) {
    setSavingMapping(true);
    setError(null);
    try {
      await window.electron.admin.setDiagnosisDepartments(diagnosisId, expandedDepartmentIds);
      setExpandedId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not save department mapping: ${message}`);
    } finally {
      setSavingMapping(false);
    }
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await window.electron.admin.addDiagnosis(newName.trim());
      setNewName("");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not add diagnosis: ${message}`);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(item: MasterDataItem) {
    setEditingId(item.id);
    setEditName(item.name);
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    try {
      await window.electron.admin.updateDiagnosis(id, editName.trim());
      setEditingId(null);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not rename diagnosis: ${message}`);
    }
  }

  async function toggleActive(item: MasterDataItem) {
    try {
      await window.electron.admin.setDiagnosisActive(item.id, !item.active);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not update diagnosis: ${message}`);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Diagnoses</h2>
      <p className="hint">
        Deactivated diagnoses no longer appear in the Registration dropdown, but existing patient records that used
        them are unaffected — diagnosis text is saved on the record at registration time, not linked live to this
        list.
      </p>

      <form className="master-add-form" onSubmit={submitAdd}>
        <input
          className="inp"
          placeholder="New diagnosis name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={adding || !newName.trim()}>
          {adding ? "Adding..." : "Add Diagnosis"}
        </button>
      </form>

      {error && <p className="err">{error}</p>}

      {loading ? (
        <p className="hint">Loading…</p>
      ) : (
        <table className="hist-table master-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    {editingId === item.id ? (
                      <input
                        className="inp"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      item.name
                    )}
                  </td>
                  <td>
                    <span className={item.active ? "status-badge active" : "status-badge inactive"}>
                      {item.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      {editingId === item.id ? (
                        <>
                          <button className="btn-secondary sm" onClick={() => saveEdit(item.id)}>
                            Save
                          </button>
                          <button className="btn-ghost" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="btn-secondary sm" onClick={() => startEdit(item)}>
                            Rename
                          </button>
                          <button className="btn-ghost" onClick={() => toggleActive(item)}>
                            {item.active ? "Deactivate" : "Activate"}
                          </button>
                          <button className="btn-ghost" onClick={() => toggleExpand(item)}>
                            {expandedId === item.id ? "Hide Departments" : "Departments"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr>
                    <td colSpan={3}>
                      <div className="mapping-panel">
                        <p className="hint">
                          Departments this diagnosis routes to in Registration. Leave none checked if this diagnosis
                          doesn't need the Department step.
                        </p>
                        {departments.length === 0 ? (
                          <p className="empty-note">No departments exist yet — add one on the Departments screen.</p>
                        ) : (
                          <div className="checklist">
                            {departments.map((d) => (
                              <label className="radio" key={d.id}>
                                <input
                                  type="checkbox"
                                  checked={expandedDepartmentIds.includes(d.id)}
                                  onChange={() => toggleDepartmentChecked(d.id)}
                                />
                                {d.name}
                                {!d.active && (
                                  <span className="status-badge inactive" style={{ marginLeft: 6 }}>
                                    Inactive
                                  </span>
                                )}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="actions bar">
                          <button
                            className="btn-secondary sm"
                            onClick={() => setExpandedId(null)}
                            disabled={savingMapping}
                          >
                            Cancel
                          </button>
                          <button
                            className="btn-primary sm"
                            onClick={() => saveMapping(item.id)}
                            disabled={savingMapping}
                          >
                            {savingMapping ? "Saving..." : "Save Mapping"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
