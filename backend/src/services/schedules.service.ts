import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Schedule } from "../types";
import { canTransition } from "./scheduleStateMachine";
import {
  CreateScheduleInput,
  UpdateScheduleInput,
} from "../validators/schedules.validator";

const SORTABLE_COLUMNS = new Set(["scheduled_date", "created_at", "updated_at"]);

function overdueExpr(alias: string): string {
  return `CASE WHEN ${alias}.status IN ('pending','in_progress') AND ${alias}.scheduled_date < CURRENT_DATE THEN true ELSE false END`;
}

export interface ScheduleListItem extends Schedule {
  is_overdue: boolean;
}

export interface ScheduleDetail extends Schedule {
  is_overdue: boolean;
  assigned_to_person: { id: string; name: string };
  project: { id: string; name: string } | null;
  server: { id: string; name: string } | null;
}

export interface ListSchedulesParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListSchedulesResult {
  data: ScheduleListItem[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

export async function listSchedules(params: ListSchedulesParams): Promise<ListSchedulesResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.deletedMode === "true") {
    conditions.push("deleted_at IS NOT NULL");
  } else if (params.deletedMode === "false") {
    conditions.push("deleted_at IS NULL");
  }

  if (params.projectId) {
    values.push(params.projectId);
    conditions.push(`project_id = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }

  if (params.from) {
    values.push(params.from);
    conditions.push(`scheduled_date >= $${values.length}`);
  }

  if (params.to) {
    values.push(params.to);
    conditions.push(`scheduled_date <= $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "scheduled_date";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM schedules ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Schedule & { is_overdue: boolean }>(
    `SELECT *, ${overdueExpr("schedules")} AS is_overdue FROM schedules ${where}
     ORDER BY ${sortColumn} ${orderDirection}
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    values
  );

  return {
    data: dataResult.rows,
    pagination: {
      page: params.page,
      per_page: params.perPage,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / params.perPage),
    },
  };
}

export async function getScheduleById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<ScheduleDetail> {
  const deletedCondition = opts.includeDeleted ? "" : "AND s.deleted_at IS NULL";
  const result = await pool.query(
    `SELECT s.*, ${overdueExpr("s")} AS is_overdue,
            au.id AS assigned_ref_id, au.name AS assigned_name,
            p.id AS project_ref_id, p.name AS project_name,
            sv.id AS server_ref_id, sv.display_name AS server_name
     FROM schedules s
     JOIN people au ON au.id = s.assigned_to
     LEFT JOIN projects p ON p.id = s.project_id
     LEFT JOIN servers sv ON sv.id = s.server_id
     WHERE s.id = $1 ${deletedCondition}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Schedule not found");

  const {
    assigned_ref_id,
    assigned_name,
    project_ref_id,
    project_name,
    server_ref_id,
    server_name,
    ...schedule
  } = row;

  return {
    ...schedule,
    assigned_to_person: { id: assigned_ref_id, name: assigned_name },
    project: project_ref_id ? { id: project_ref_id, name: project_name } : null,
    server: server_ref_id ? { id: server_ref_id, name: server_name } : null,
  };
}

export async function createSchedule(
  input: CreateScheduleInput,
  actingPeopleId: string
): Promise<Schedule> {
  return withTransaction(async (tx) => {
    if (input.project_id) {
      const projectCheck = await tx.query(
        `SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
        [input.project_id]
      );
      if (projectCheck.rows.length === 0) {
        throw new ApiError(
          400,
          "project_id does not reference an existing project",
          "VALIDATION_ERROR",
          { field: "project_id" }
        );
      }
    }

    if (input.server_id) {
      const serverCheck = await tx.query(
        `SELECT id FROM servers WHERE id = $1 AND deleted_at IS NULL`,
        [input.server_id]
      );
      if (serverCheck.rows.length === 0) {
        throw new ApiError(
          400,
          "server_id does not reference an existing server",
          "VALIDATION_ERROR",
          { field: "server_id" }
        );
      }
    }

    // Explicit business rule (not just an FK check): a schedule cannot be
    // assigned to a person who has been soft-deleted, even though the FK
    // itself would happily accept it (the people row still exists).
    const assigneeCheck = await tx.query(
      `SELECT id FROM people WHERE id = $1 AND deleted_at IS NULL`,
      [input.assigned_to]
    );
    if (assigneeCheck.rows.length === 0) {
      throw new ApiError(
        400,
        "assigned_to does not reference an existing, active person",
        "VALIDATION_ERROR",
        { field: "assigned_to" }
      );
    }

    // status is always 'pending' on create — the client cannot set the
    // initial status to anything else (the schema doesn't even expose the field).
    const result = await tx.query<Schedule>(
      `INSERT INTO schedules (project_id, server_id, title, type, scheduled_date, assigned_to, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [
        input.project_id ?? null,
        input.server_id ?? null,
        input.title,
        input.type,
        input.scheduled_date,
        input.assigned_to,
        input.notes ?? null,
      ]
    );
    const created = result.rows[0];
    await logActivity("schedule", created.id, "create", actingPeopleId, null, created, tx);
    return created;
  });
}

/**
 * Status transitions are validated exclusively via canTransition() — see
 * scheduleStateMachine.ts, the single source of truth. started_at/completed_at
 * are set server-side only, exactly when the corresponding transition occurs.
 * The `updated_at` comparison truncates to milliseconds for the same reason as
 * every other module: the value round-trips through JSON/JS Date at millisecond
 * precision while the column stores microseconds.
 */
export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput,
  actingPeopleId: string
): Promise<Schedule> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Schedule>(
      `SELECT * FROM schedules WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Schedule not found");

    let startedAt: string | null = null;
    let completedAt: string | null = null;

    if (input.status && input.status !== existing.status) {
      if (!canTransition(existing.status, input.status)) {
        throw new ApiError(
          400,
          `Cannot transition from '${existing.status}' to '${input.status}'`,
          "VALIDATION_ERROR",
          { field: "status" }
        );
      }
      if (input.status === "in_progress" && !existing.started_at) {
        startedAt = new Date().toISOString();
      }
      if (input.status === "done") {
        completedAt = new Date().toISOString();
      }
    }

    const result = await tx.query<Schedule>(
      `UPDATE schedules
       SET status = COALESCE($3, status),
           notes = COALESCE($4, notes),
           started_at = COALESCE($5, started_at),
           completed_at = COALESCE($6, completed_at),
           updated_at = now()
       WHERE id = $1
         AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
         AND deleted_at IS NULL
       RETURNING *`,
      [id, input.updated_at, input.status ?? null, input.notes ?? null, startedAt, completedAt]
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new ApiError(
        409,
        "Schedule was modified by someone else; refresh and try again",
        "CONFLICT"
      );
    }
    await logActivity("schedule", updated.id, "update", actingPeopleId, existing, updated, tx);
    return updated;
  });
}

export async function softDeleteSchedule(id: string, actingPeopleId: string): Promise<Schedule> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Schedule>(
      `SELECT * FROM schedules WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Schedule not found");

    const result = await tx.query<Schedule>(
      `UPDATE schedules SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    const deleted = result.rows[0];
    await logActivity("schedule", deleted.id, "delete", actingPeopleId, existing, deleted, tx);
    return deleted;
  });
}

export async function restoreSchedule(id: string, actingPeopleId: string): Promise<Schedule> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Schedule>(`SELECT * FROM schedules WHERE id = $1`, [id]);
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Schedule not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Schedule is not deleted", "CONFLICT");
    }

    const result = await tx.query<Schedule>(
      `UPDATE schedules SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [id]
    );
    const restored = result.rows[0];
    await logActivity("schedule", restored.id, "restore", actingPeopleId, existing, restored, tx);
    return restored;
  });
}
