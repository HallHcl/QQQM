import { pool } from "../db/pool";
import { ActivityLog } from "../types";

export interface ListActivityLogsFilters {
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export async function listActivityLogs(
  filters: ListActivityLogsFilters
): Promise<ActivityLog[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.entityType) {
    params.push(filters.entityType);
    conditions.push(`entity_type = $${params.length}`);
  }

  if (filters.entityId) {
    params.push(filters.entityId);
    conditions.push(`entity_id = $${params.length}`);
  }

  if (filters.from) {
    params.push(filters.from);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (filters.to) {
    params.push(filters.to);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<ActivityLog>(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}
