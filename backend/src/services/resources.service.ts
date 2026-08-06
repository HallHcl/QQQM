import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Resource } from "../types";
import {
  CreateResourceInput,
  UpdateResourceInput,
} from "../validators/resources.validator";

export interface ListResourcesFilters {
  projectId?: string;
  type?: string;
  search?: string;
}

export async function listResources(
  filters: ListResourcesFilters
): Promise<Resource[]> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(`project_id = $${params.length}`);
  }

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`title ILIKE $${params.length}`);
  }

  const result = await pool.query<Resource>(
    `SELECT * FROM resources WHERE ${conditions.join(" AND ")} ORDER BY title`,
    params
  );
  return result.rows;
}

export async function getResourceById(id: string): Promise<Resource | null> {
  const result = await pool.query<Resource>(
    `SELECT * FROM resources WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function insertResource(
  data: Pick<CreateResourceInput, "project_id" | "type" | "title" | "category" | "tags">,
  client: PoolClient
): Promise<Resource> {
  const result = await client.query<Resource>(
    `INSERT INTO resources (project_id, type, title, category, tags)
     VALUES ($1, $2, $3, $4, COALESCE($5, '[]')::jsonb)
     RETURNING *`,
    [
      data.project_id ?? null,
      data.type,
      data.title,
      data.category ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
    ]
  );
  return result.rows[0];
}

export async function setCurrentVersion(
  resourceId: string,
  versionId: string,
  client: PoolClient
): Promise<Resource> {
  const result = await client.query<Resource>(
    `UPDATE resources SET current_version_id = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [resourceId, versionId]
  );
  return result.rows[0];
}

export async function updateResourceMetadata(
  id: string,
  data: UpdateResourceInput,
  client: PoolClient
): Promise<Resource | null> {
  const result = await client.query<Resource>(
    `UPDATE resources
     SET type = COALESCE($2, type),
         title = COALESCE($3, title),
         category = COALESCE($4, category),
         tags = COALESCE($5, tags),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      data.type ?? null,
      data.title ?? null,
      data.category ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteResource(
  id: string,
  client: PoolClient
): Promise<Resource | null> {
  const result = await client.query<Resource>(
    `UPDATE resources SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
