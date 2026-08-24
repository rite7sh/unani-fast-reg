import { Fragment, useEffect, useState, type FormEvent } from "react";

// Same list/add/rename/activate pattern as AdminDiagnosesScreen.tsx and
// AdminConsultantsScreen.tsx, plus a Consultants mapping section per row —
// this is the department-side half of the Diagnosis → Department →
// Consultant chain (the diagnosis-side half lives on AdminDiagnosesScreen).
export default function AdminDepartmentsScreen() {
  const [items, setItems] = useState<MasterDataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // Consultant mapping — which consultants belong to a department. Loaded
  // once (the full consultant list, including inactive, so Admin can see
  // what's currently assigned even if a consultant was since deactivated);
  // per-department membership is fetched lazily on expand.
  const [consultants, setConsultants] = useState<MasterDataItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedConsultantIds, setExpandedConsultantIds] = useState<number[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    window.electron.admin
      .listDepartments()
      .then(setItems)
      .catch((err) => {
        console.error("[AdminDepartments] Failed to load:", err);
        setError("Could not load departments.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);
  useEffect(() => {
    window.electron.admin.listConsultants().then(setConsultants).catch(() => undefined);
  }, []);

  async function toggleExpand(item: MasterDataItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setError(null);
    try {
      const ids = await window.electron.admin.getDepartmentConsultants(item.id);
      setExpandedConsultantIds(ids);
      setExpandedId(item.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not load consultant mapping: ${message}`);
    }
  }

  function toggleConsultantChecked(consultantId: number) {
    setExpandedConsultantIds((prev) =>
      prev.includes(consultantId) ? prev.filter((id) => id !== consultantId) : [...prev, consultantId]
    );
  }

  async function saveMapping(departmentId: number) {
    setSavingMapping(true);
    setError(null);
    try {
      await window.electron.admin.setDepartmentConsultants(departmentId, expandedConsultantIds);
      setExpandedId(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not save consultant mapping: ${message}`);
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
      await window.electron.admin.addDepartment(newName.trim());
      setNewName("");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not add department: ${message}`);
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
      await window.electron.admin.updateDepartment(id, editName.trim());
      setEditingId(null);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not rename department: ${message}`);
    }
  }

  async function toggleActive(item: MasterDataItem) {
    try {
      await window.electron.admin.setDepartmentActive(item.id, !item.active);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Could not update department: ${message}`);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">Departments</h2>
      <p className="hint">
        Deactivated departments no longer appear in Registration, but existing patient records that used them are
        unaffected — department text is saved on the record at registration time, not linked live to this list.
        Which diagnoses route to a department is managed on the Diagnoses screen; which consultants belong to a
        department is managed here.
      </p>

      <form className="master-add-form" onSubmit={submitAdd}>
        <input
          className="inp"
          placeholder="New department name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={adding || !newName.trim()}>
          {adding ? "Adding..." : "Add Department"}
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
                            {expandedId === item.id ? "Hide Consultants" : "Consultants"}
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
                        <p className="hint">Consultants who belong to this department.</p>
                        {consultants.length === 0 ? (
                          <p className="empty-note">No consultants exist yet — add one on the Consultants screen.</p>
                        ) : (
                          <div className="checklist">
                            {consultants.map((c) => (
                              <label className="radio" key={c.id}>
                                <input
                                  type="checkbox"
                                  checked={expandedConsultantIds.includes(c.id)}
                                  onChange={() => toggleConsultantChecked(c.id)}
                                />
                                {c.name}
                                {!c.active && (
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
