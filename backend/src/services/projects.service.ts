import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Project } from "../types";
import { CreateProjectInput, UpdateProjectInput } from "../validators/projects.validator";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const UNIQUE_VIOLATION = "23505";

export interface ProjectWithClient extends Project {
  client: { id: string; name: string };
}

export interface ListProjectsParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  clientId?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListProjectsResult {
  data: Project[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export async function listProjects(
  params: ListProjectsParams
): Promise<ListProjectsResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.deletedMode === "true") {
    conditions.push("deleted_at IS NOT NULL");
  } else if (params.deletedMode === "false") {
    conditions.push("deleted_at IS NULL");
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }

  if (params.clientId) {
    values.push(params.clientId);
    conditions.push(`client_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "name";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM projects ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Project>(
    `SELECT * FROM projects ${where}
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

export async function getProjectById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<ProjectWithClient> {
  const deletedCondition = opts.includeDeleted ? "" : "AND p.deleted_at IS NULL";
  const result = await pool.query<
    Project & { client_ref_id: string; client_name: string }
  >(
    `SELECT p.*, c.id AS client_ref_id, c.name AS client_name
     FROM projects p
     JOIN clients c ON c.id = p.client_id
     WHERE p.id = $1 ${deletedCondition}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Project not found");

  const { client_ref_id, client_name, ...project } = row;
  return { ...project, client: { id: client_ref_id, name: client_name } };
}

export async function createProject(
  input: CreateProjectInput,
  actingPeopleId: string
): Promise<Project> {
  return withTransaction(async (tx) => {
    const clientCheck = await tx.query(
      `SELECT id FROM clients WHERE id = $1 AND deleted_at IS NULL`,
      [input.client_id]
    );
    if (clientCheck.rows.length === 0) {
      throw new ApiError(
        400,
        "client_id does not reference an existing client",
        "VALIDATION_ERROR",
        { field: "client_id" }
      );
    }

    try {
      const result = await tx.query<Project>(
        `INSERT INTO projects (client_id, name, description, owner_status)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.client_id, input.name, input.description ?? null, input.owner_status]
      );
      const created = result.rows[0];
      await logActivity("project", created.id, "create", actingPeopleId, null, created, tx);
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "A project with this name already exists for this client",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}

/**
 * The `updated_at` comparison truncates to milliseconds because the value round-trips
 * through JSON/JS Date, which only carries millisecond precision, while the column
 * stores microseconds — a naive equality check would reject nearly every legitimate
 * update as "stale".
 */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
  actingPeopleId: string
): Promise<Project> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Project>(
      `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Project not found");

    try {
      const result = await tx.query<Project>(
        `UPDATE projects
         SET name = COALESCE($3, name),
             description = COALESCE($4, description),
             owner_status = COALESCE($5, owner_status),
             updated_at = now()
         WHERE id = $1
           AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
           AND deleted_at IS NULL
         RETURNING *`,
        [id, input.updated_at, input.name ?? null, input.description ?? null, input.owner_status ?? null]
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new ApiError(
          409,
          "Project was modified by someone else; refresh and try again",
          "CONFLICT"
        );
      }
      await logActivity("project", updated.id, "update", actingPeopleId, existing, updated, tx);
      return updated;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "A project with this name already exists for this client",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}

export async function softDeleteProject(
  id: string,
  actingPeopleId: string
): Promise<Project> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Project>(
      `SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Project not found");

    const result = await tx.query<Project>(
      `UPDATE projects SET deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    const deleted = result.rows[0];
    await logActivity("project", deleted.id, "delete", actingPeopleId, existing, deleted, tx);
    return deleted;
  });
}

export async function restoreProject(
  id: string,
  actingPeopleId: string
): Promise<Project> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Project>(
      `SELECT * FROM projects WHERE id = $1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Project not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Project is not deleted", "CONFLICT");
    }

    try {
      const result = await tx.query<Project>(
        `UPDATE projects SET deleted_at = NULL, updated_at = now()
         WHERE id = $1 AND deleted_at IS NOT NULL
         RETURNING *`,
        [id]
      );
      const restored = result.rows[0];
      await logActivity("project", restored.id, "restore", actingPeopleId, existing, restored, tx);
      return restored;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "A project with this name already exists for this client",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}
