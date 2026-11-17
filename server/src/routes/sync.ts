import { Router } from "express";
import type Database from "better-sqlite3";
import type { PatientSyncRow } from "../db.js";

// Accepts both the current CR- prefix and the historical OPD- prefix (see
// electron/database.ts's getNextOpdNumber()) — a device's very first sync
// after this feature ships pushes its entire backlog of pre-existing
// patients in one go, and older rows may still carry the old prefix.
const OPD_NO_PATTERN = /^(CR|OPD)-\d{4}-\d{5}$/;

// One request body is capped well below any realistic single-hospital
// backlog size — the client (electron/sync.ts) chunks its push into
// batches of 200, this is just a hard backstop against a malformed/huge
// request.
const MAX_PUSH_BATCH = 500;
// Pull is paginated the same way list/download already are elsewhere in
// this server — the client loops calling /pull with the returned cursor
// until a response comes back with zero rows, so this limit only bounds a
// single response's size, never the total amount a client can catch up on.
const PULL_PAGE_LIMIT = 500;

interface IncomingPatient {
  opd_no: string;
  registration_date: string;
  registration_time: string | null;
  patient_name: string;
  age_years: number;
  age_months: number;
  gender: string;
  address: string;
  aadhaar_number: string | null;
  mobile_number: string | null;
  department: string | null;
  consultant: string;
  employee_id: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

// Rejects a row individually rather than failing the whole batch — one
// malformed row (e.g. a future client bug) must never block every other
// legitimate row in the same push from being stored. See the "Admin does
// not receive partial/corrupted records" requirement: this is the gate
// that keeps a corrupted row out of patient_sync in the first place, so
// there is nothing partial/corrupted for a later pull to ever hand back.
function validateRow(row: unknown): { ok: true; row: IncomingPatient } | { ok: false; error: string } {
  if (!row || typeof row !== "object") return { ok: false, error: "Row is not an object" };
  const r = row as Record<string, unknown>;

  if (typeof r.opd_no !== "string" || !OPD_NO_PATTERN.test(r.opd_no)) {
    return { ok: false, error: "Missing or invalid opd_no" };
  }
  if (typeof r.patient_name !== "string" || !r.patient_name.trim()) {
    return { ok: false, error: "Missing patient_name" };
  }
  if (typeof r.gender !== "string" || !r.gender) return { ok: false, error: "Missing gender" };
  if (typeof r.address !== "string") return { ok: false, error: "Missing address" };
  if (typeof r.consultant !== "string" || !r.consultant) return { ok: false, error: "Missing consultant" };
  if (typeof r.employee_id !== "string" || !r.employee_id) return { ok: false, error: "Missing employee_id" };
  if (typeof r.registration_date !== "string" || !r.registration_date) {
    return { ok: false, error: "Missing registration_date" };
  }
  if (typeof r.age_years !== "number" || typeof r.age_months !== "number") {
    return { ok: false, error: "Missing or invalid age" };
  }
  if (typeof r.created_at !== "string" || !r.created_at || typeof r.updated_at !== "string" || !r.updated_at) {
    return { ok: false, error: "Missing created_at/updated_at" };
  }

  return {
    ok: true,
    row: {
      opd_no: r.opd_no,
      registration_date: r.registration_date,
      registration_time: typeof r.registration_time === "string" ? r.registration_time : null,
      patient_name: r.patient_name,
      age_years: r.age_years,
      age_months: r.age_months,
      gender: r.gender,
      address: r.address,
      aadhaar_number: typeof r.aadhaar_number === "string" ? r.aadhaar_number : null,
      mobile_number: typeof r.mobile_number === "string" ? r.mobile_number : null,
      department: typeof r.department === "string" ? r.department : null,
      consultant: r.consultant,
      employee_id: r.employee_id,
      is_deleted: r.is_deleted ? 1 : 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    },
  };
}

export function createSyncRouter(db: Database.Database) {
  const router = Router();

  // Structured operational data (individual patient fields), never raw
  // database files — see storage.ts/backup.ts for the separate disaster-
  // recovery path. Idempotent by design: re-posting the same row (a client
  // retry after a dropped response, or a second device re-sending a row
  // this server already has) is always safe — see the "already have an
  // equal-or-newer copy" branch below.
  router.post("/push", (req, res) => {
    const device = req.device!;
    const body = req.body as { patients?: unknown[] } | undefined;

    if (!body || !Array.isArray(body.patients)) {
      res.status(400).json({ error: "Missing patients array" });
      return;
    }
    if (body.patients.length === 0) {
      res.json({ accepted: [], rejected: [] });
      return;
    }
    if (body.patients.length > MAX_PUSH_BATCH) {
      res.status(400).json({ error: `Batch too large (max ${MAX_PUSH_BATCH} rows per request)` });
      return;
    }

    const accepted: string[] = [];
    const rejected: { opd_no: string; error: string }[] = [];
    const now = new Date().toISOString();

    const existingStmt = db.prepare(
      "SELECT source_updated_at FROM patient_sync WHERE hospital_id = ? AND opd_no = ?"
    );
    const upsert = db.prepare(`
      INSERT INTO patient_sync (
        hospital_id, opd_no, registration_date, registration_time, patient_name, age_years, age_months,
        gender, address, aadhaar_number, mobile_number, department, consultant,
        employee_id, is_deleted, source_created_at, source_updated_at, device_id, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(hospital_id, opd_no) DO UPDATE SET
        registration_date = excluded.registration_date,
        registration_time = excluded.registration_time,
        patient_name = excluded.patient_name,
        age_years = excluded.age_years,
        age_months = excluded.age_months,
        gender = excluded.gender,
        address = excluded.address,
        aadhaar_number = excluded.aadhaar_number,
        mobile_number = excluded.mobile_number,
        department = excluded.department,
        consultant = excluded.consultant,
        employee_id = excluded.employee_id,
        is_deleted = excluded.is_deleted,
        source_updated_at = excluded.source_updated_at,
        device_id = excluded.device_id,
        synced_at = excluded.synced_at
    `);

    const run = db.transaction((rows: unknown[]) => {
      for (const raw of rows) {
        const validation = validateRow(raw);
        if (!validation.ok) {
          const opdNo = typeof (raw as Record<string, unknown> | null)?.opd_no === "string"
            ? (raw as Record<string, unknown>).opd_no as string
            : "(unknown)";
          rejected.push({ opd_no: opdNo, error: validation.error });
          continue;
        }
        const r = validation.row;
        const existing = existingStmt.get(device.hospital_id, r.opd_no) as
          | { source_updated_at: string }
          | undefined;

        // Already have an equal-or-newer copy — confirm without writing.
        // Comparing ISO timestamp strings lexically is valid here because
        // both sides always produce them via toISOString() (fixed-width,
        // zero-padded, UTC), matching the same comparison already used in
        // electron/database.ts's upsertSyncedPatientFromServer().
        if (existing && r.updated_at <= existing.source_updated_at) {
          accepted.push(r.opd_no);
          continue;
        }

        upsert.run(
          device.hospital_id,
          r.opd_no,
          r.registration_date,
          r.registration_time,
          r.patient_name,
          r.age_years,
          r.age_months,
          r.gender,
          r.address,
          r.aadhaar_number,
          r.mobile_number,
          r.department,
          r.consultant,
          r.employee_id,
          r.is_deleted,
          r.created_at,
          r.updated_at,
          device.device_id,
          now
        );
        accepted.push(r.opd_no);
      }
    });

    run(body.patients);

    res.json({ accepted, rejected });
  });

  // Returns every patient_sync row for this hospital touched after `since`
  // (a synced_at cursor from a previous /pull response), oldest first, one
  // page at a time. An empty `since` returns everything from the beginning
  // — a fresh device's first-ever pull. `is_deleted` is included, not
  // filtered out, so a soft-delete propagates to every puller the same way
  // any other field change does.
  router.get("/pull", (req, res) => {
    const device = req.device!;
    const since = typeof req.query.since === "string" ? req.query.since : "";

    const rows = db
      .prepare(
        `SELECT opd_no, registration_date, registration_time, patient_name, age_years, age_months, gender, address,
                aadhaar_number, mobile_number, department, consultant, employee_id, is_deleted,
                source_created_at AS created_at, source_updated_at AS updated_at, synced_at
         FROM patient_sync
         WHERE hospital_id = ? AND synced_at > ?
         ORDER BY synced_at ASC
         LIMIT ?`
      )
      .all(device.hospital_id, since, PULL_PAGE_LIMIT) as (Pick<
      PatientSyncRow,
      | "opd_no"
      | "registration_date"
      | "registration_time"
      | "patient_name"
      | "age_years"
      | "age_months"
      | "gender"
      | "address"
      | "aadhaar_number"
      | "mobile_number"
      | "department"
      | "consultant"
      | "employee_id"
      | "is_deleted"
    > & { created_at: string; updated_at: string; synced_at: string })[];

    const cursor = rows.length > 0 ? rows[rows.length - 1].synced_at : since || null;
    res.json({
      patients: rows.map(({ synced_at, ...rest }) => rest),
      cursor,
    });
  });

  return router;
}
