import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ActivityAction, EntityType } from "../types";

export async function logActivity(
  entityType: EntityType,
  entityId: string,
  action: ActivityAction,
  changedBy: string,
  oldValue: unknown,
  newValue: unknown,
  client?: PoolClient
) {
  const executor = client ?? pool;

  await executor.query(
    `INSERT INTO activity_logs (entity_type, entity_id, action, changed_by, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entityType,
      entityId,
      action,
      changedBy,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
    ]
  );
}
