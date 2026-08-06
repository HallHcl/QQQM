import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Project } from "../types";
import { CreateProjectInput, UpdateProjectInput } from "../validators/projects.validator";

export async function listProjects(clientId?: string): Promise<Project[]> {
  if (clientId) {
    const result = await pool.query<Project>(
      `SELECT * FROM projects WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name`,
      [clientId]
    );
    return result.rows;
  }
  const result = await pool.query<Project>(
    `SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY name`
  );
  return result.rows;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const result = await pool.query<Project>(
    `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createProject(
  data: CreateProjectInput,
  client: PoolClient
): Promise<Project> {
  const result = await client.query<Project>(
    `INSERT INTO projects (client_id, name, description, owner_status)
     VALUES ($1, $2, $3, COALESCE($4, 'active'))
     RETURNING *`,
    [data.client_id, data.name, data.description ?? null, data.owner_status ?? null]
  );
  return result.rows[0];
}

export async function updateProject(
  id: string,
  data: UpdateProjectInput,
  client: PoolClient
): Promise<Project | null> {
  const result = await client.query<Project>(
    `UPDATE projects
     SET client_id = COALESCE($2, client_id),
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         owner_status = COALESCE($5, owner_status),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      data.client_id ?? null,
      data.name ?? null,
      data.description ?? null,
      data.owner_status ?? null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteProject(
  id: string,
  client: PoolClient
): Promise<Project | null> {
  const result = await client.query<Project>(
    `UPDATE projects SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
