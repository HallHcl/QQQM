import { pool } from "../db/pool";
import { ActivityLog } from "../types";

// No write functions exist in this module by design: activity_logs is
// append-only, and every insert happens from within the originating module's
// own service transaction (Parts 10-16). This service is read-only.

export interface ListActivityLogsParams {
  page: number;
  perPage: number;
  order: "asc" | "desc";
  entityType?: string;
  entityId?: string;
  action?: string;
  changedBy?: string;
  from?: string;
  to?: string;
}

export interface ActivityLogListItem extends ActivityLog {
  changed_by_person: { id: string; name: string };
}

export interface ListActivityLogsResult {
  data: ActivityLogListItem[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

export async function listActivityLogs(
  params: ListActivityLogsParams
): Promise<ListActivityLogsResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.entityType) {
    values.push(params.entityType);
    conditions.push(`al.entity_type = $${values.length}`);
  }

  if (params.entityId) {
    values.push(params.entityId);
    conditions.push(`al.entity_id = $${values.length}`);
  }

  if (params.action) {
    values.push(params.action);
    conditions.push(`al.action = $${values.length}`);
  }

  if (params.changedBy) {
    values.push(params.changedBy);
    conditions.push(`al.changed_by = $${values.length}`);
  }

  if (params.from) {
    values.push(params.from);
    conditions.push(`al.created_at >= $${values.length}`);
  }

  if (params.to) {
    values.push(params.to);
    conditions.push(`al.created_at <= $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM activity_logs al ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query(
    `SELECT al.*, p.id AS person_ref_id, p.name AS person_name
     FROM activity_logs al
     JOIN people p ON p.id = al.changed_by
     ${where}
     ORDER BY al.created_at ${orderDirection}
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    values
  );

  return {
    data: dataResult.rows.map((row) => {
      const { person_ref_id, person_name, ...log } = row;
      return { ...log, changed_by_person: { id: person_ref_id, name: person_name } };
    }),
    pagination: {
      page: params.page,
      per_page: params.perPage,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / params.perPage),
    },
  };
}
