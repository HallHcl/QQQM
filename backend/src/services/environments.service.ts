import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Environment, Server } from "../types";
import {
  CreateEnvironmentInput,
  UpdateEnvironmentInput,
} from "../validators/environments.validator";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const UNIQUE_VIOLATION = "23505";

export interface EnvironmentWithProject extends Environment {
  project: { id: string; name: string };
}

export interface ListEnvironmentsParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  projectId?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListEnvironmentsResult {
  data: Environment[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export async function listEnvironments(
  params: ListEnvironmentsParams
): Promise<ListEnvironmentsResult> {
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

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "name";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM environments ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Environment>(
    `SELECT * FROM environments ${where}
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

export async function getEnvironmentById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<EnvironmentWithProject> {
  const deletedCondition = opts.includeDeleted ? "" : "AND e.deleted_at IS NULL";
  const result = await pool.query<
    Environment & { project_ref_id: string; project_name: string }
  >(
    `SELECT e.*, p.id AS project_ref_id, p.name AS project_name
     FROM environments e
     JOIN projects p ON p.id = e.project_id
     WHERE e.id = $1 ${deletedCondition}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Environment not found");

  const { project_ref_id, project_name, ...environment } = row;
  return { ...environment, project: { id: project_ref_id, name: project_name } };
}

export async function createEnvironment(
  input: CreateEnvironmentInput,
  actingPeopleId: string
): Promise<Environment> {
  return withTransaction(async (tx) => {
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

    try {
      const result = await tx.query<Environment>(
        `INSERT INTO environments (project_id, name, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.project_id, input.name, input.description ?? null]
      );
      const created = result.rows[0];
      await logActivity("environment", created.id, "create", actingPeopleId, null, created, tx);
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "An environment with this name already exists for this project",
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
export async function updateEnvironment(
  id: string,
  input: UpdateEnvironmentInput,
  actingPeopleId: string
): Promise<Environment> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Environment>(
      `SELECT * FROM environments WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Environment not found");

    const vpnResourceProvided = Object.prototype.hasOwnProperty.call(input, "vpn_resource_id");
    if (vpnResourceProvided && input.vpn_resource_id) {
      const resourceCheck = await tx.query(
        `SELECT id FROM resources WHERE id = $1 AND deleted_at IS NULL`,
        [input.vpn_resource_id]
      );
      if (resourceCheck.rows.length === 0) {
        throw new ApiError(
          400,
          "vpn_resource_id does not reference an existing resource",
          "VALIDATION_ERROR",
          { field: "vpn_resource_id" }
        );
      }
    }

    try {
      const result = await tx.query<Environment>(
        `UPDATE environments
         SET name = COALESCE($3, name),
             description = COALESCE($4, description),
             vpn_resource_id = CASE WHEN $5 THEN $6 ELSE vpn_resource_id END,
             updated_at = now()
         WHERE id = $1
           AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
           AND deleted_at IS NULL
         RETURNING *`,
        [
          id,
          input.updated_at,
          input.name ?? null,
          input.description ?? null,
          vpnResourceProvided,
          input.vpn_resource_id ?? null,
        ]
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new ApiError(
          409,
          "Environment was modified by someone else; refresh and try again",
          "CONFLICT"
        );
      }
      await logActivity("environment", updated.id, "update", actingPeopleId, existing, updated, tx);
      return updated;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "An environment with this name already exists for this project",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}

/**
 * Soft-deletes the environment and cascades to its servers and their
 * credential_references, all within one transaction:
 *  - servers are soft-deleted (and each gets its own activity_logs row)
 *  - credential_references are hard-deleted, since that table has no
 *    `deleted_at` column by design (no-soft-delete for credential refs).
 */
export async function softDeleteEnvironment(
  id: string,
  actingPeopleId: string
): Promise<Environment> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Environment>(
      `SELECT * FROM environments WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Environment not found");

    const serversResult = await tx.query<Server>(
      `SELECT * FROM servers WHERE environment_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    for (const server of serversResult.rows) {
      await tx.query(
        `DELETE FROM credential_references WHERE server_id = $1`,
        [server.id]
      );

      const deletedServerResult = await tx.query<Server>(
        `UPDATE servers SET deleted_at = now()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [server.id]
      );
      const deletedServer = deletedServerResult.rows[0];
      await logActivity("server", deletedServer.id, "delete", actingPeopleId, server, deletedServer, tx);
    }

    const result = await tx.query<Environment>(
      `UPDATE environments SET deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    const deleted = result.rows[0];
    await logActivity("environment", deleted.id, "delete", actingPeopleId, existing, deleted, tx);
    return deleted;
  });
}

/**
 * Restores the environment row only. Servers cascade-deleted alongside it are
 * NOT automatically restored — see report for why (follow-up once Servers has
 * a full CRUD/restore of its own).
 */
export async function restoreEnvironment(
  id: string,
  actingPeopleId: string
): Promise<Environment> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Environment>(
      `SELECT * FROM environments WHERE id = $1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Environment not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Environment is not deleted", "CONFLICT");
    }

    try {
      const result = await tx.query<Environment>(
        `UPDATE environments SET deleted_at = NULL, updated_at = now()
         WHERE id = $1 AND deleted_at IS NOT NULL
         RETURNING *`,
        [id]
      );
      const restored = result.rows[0];
      await logActivity("environment", restored.id, "restore", actingPeopleId, existing, restored, tx);
      return restored;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "An environment with this name already exists for this project",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}
