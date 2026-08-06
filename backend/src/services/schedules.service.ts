import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Schedule } from "../types";
import {
  CreateScheduleInput,
  UpdateScheduleInput,
} from "../validators/schedules.validator";

export interface ListSchedulesFilters {
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export async function listSchedules(
  filters: ListSchedulesFilters
): Promise<Schedule[]> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(`project_id = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  if (filters.from) {
    params.push(filters.from);
    conditions.push(`scheduled_date >= $${params.length}`);
  }

  if (filters.to) {
    params.push(filters.to);
    conditions.push(`scheduled_date <= $${params.length}`);
  }

  const result = await pool.query<Schedule>(
    `SELECT * FROM schedules WHERE ${conditions.join(" AND ")} ORDER BY scheduled_date`,
    params
  );
  return result.rows;
}

export async function getScheduleById(id: string): Promise<Schedule | null> {
  const result = await pool.query<Schedule>(
    `SELECT * FROM schedules WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSchedule(
  data: CreateScheduleInput,
  client: PoolClient
): Promise<Schedule> {
  const result = await client.query<Schedule>(
    `INSERT INTO schedules (project_id, server_id, title, type, scheduled_date, assigned_to, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'pending'), $8)
     RETURNING *`,
    [
      data.project_id ?? null,
      data.server_id ?? null,
      data.title,
      data.type,
      data.scheduled_date,
      data.assigned_to,
      data.status ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateSchedule(
  id: string,
  data: UpdateScheduleInput,
  client: PoolClient
): Promise<Schedule | null> {
  const result = await client.query<Schedule>(
    `UPDATE schedules
     SET project_id = COALESCE($2, project_id),
         server_id = COALESCE($3, server_id),
         title = COALESCE($4, title),
         type = COALESCE($5, type),
         scheduled_date = COALESCE($6, scheduled_date),
         started_at = COALESCE($7, started_at),
         completed_at = COALESCE($8, completed_at),
         assigned_to = COALESCE($9, assigned_to),
         status = COALESCE($10, status),
         notes = COALESCE($11, notes),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      data.project_id ?? null,
      data.server_id ?? null,
      data.title ?? null,
      data.type ?? null,
      data.scheduled_date ?? null,
      data.started_at ?? null,
      data.completed_at ?? null,
      data.assigned_to ?? null,
      data.status ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteSchedule(
  id: string,
  client: PoolClient
): Promise<Schedule | null> {
  const result = await client.query<Schedule>(
    `UPDATE schedules SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
