import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Environment } from "../types";
import {
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
} from "../validators/environments.validator";

export async function listEnvironments(
  projectId?: string
): Promise<Environment[]> {
  if (projectId) {
    const result = await pool.query<Environment>(
      `SELECT * FROM environments WHERE deleted_at IS NULL AND project_id = $1 ORDER BY name`,
      [projectId]
    );
    return result.rows;
  }
  const result = await pool.query<Environment>(
    `SELECT * FROM environments WHERE deleted_at IS NULL ORDER BY name`
  );
  return result.rows;
}

export async function getEnvironmentById(
  id: string
): Promise<Environment | null> {
  const result = await pool.query<Environment>(
    `SELECT * FROM environments WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createEnvironment(
  data: CreateEnvironmentInput,
  client: PoolClient
): Promise<Environment> {
  const result = await client.query<Environment>(
    `INSERT INTO environments (project_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.project_id, data.name, data.description ?? null]
  );
  return result.rows[0];
}

export async function updateEnvironment(
  id: string,
  data: UpdateEnvironmentInput,
  client: PoolClient
): Promise<Environment | null> {
  const result = await client.query<Environment>(
    `UPDATE environments
     SET project_id = COALESCE($2, project_id),
         name = COALESCE($3, name),
         description = COALESCE($4, description)
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, data.project_id ?? null, data.name ?? null, data.description ?? null]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteEnvironment(
  id: string,
  client: PoolClient
): Promise<Environment | null> {
  const result = await client.query<Environment>(
    `UPDATE environments SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
