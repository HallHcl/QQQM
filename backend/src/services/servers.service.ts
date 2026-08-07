import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Server } from "../types";
import { CreateServerInput, UpdateServerInput } from "../validators/servers.validator";

const SORTABLE_COLUMNS = new Set(["display_name", "created_at", "updated_at"]);
const UNIQUE_VIOLATION = "23505";

export interface ServerWithContext extends Server {
  environment: { id: string; name: string; project: { id: string; name: string } };
}

export interface ListServersParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  environmentId?: string;
  serviceType?: string;
  accessMethod?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListServersResult {
  data: Server[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export async function listServers(
  params: ListServersParams
): Promise<ListServersResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.deletedMode === "true") {
    conditions.push("deleted_at IS NOT NULL");
  } else if (params.deletedMode === "false") {
    conditions.push("deleted_at IS NULL");
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`(display_name ILIKE $${values.length} OR hostname ILIKE $${values.length})`);
  }

  if (params.environmentId) {
    values.push(params.environmentId);
    conditions.push(`environment_id = $${values.length}`);
  }

  if (params.serviceType) {
    values.push(params.serviceType);
    conditions.push(`service_type = $${values.length}`);
  }

  if (params.accessMethod) {
    values.push(params.accessMethod);
    conditions.push(`access_method = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "display_name";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM servers ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Server>(
    `SELECT * FROM servers ${where}
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

export async function getServerById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<ServerWithContext> {
  const deletedCondition = opts.includeDeleted ? "" : "AND s.deleted_at IS NULL";
  const result = await pool.query<
    Server & {
      env_ref_id: string;
      env_name: string;
      project_ref_id: string;
      project_name: string;
    }
  >(
    `SELECT s.*,
            e.id AS env_ref_id, e.name AS env_name,
            p.id AS project_ref_id, p.name AS project_name
     FROM servers s
     JOIN environments e ON e.id = s.environment_id
     JOIN projects p ON p.id = e.project_id
     WHERE s.id = $1 ${deletedCondition}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Server not found");

  const { env_ref_id, env_name, project_ref_id, project_name, ...server } = row;
  return {
    ...server,
    environment: {
      id: env_ref_id,
      name: env_name,
      project: { id: project_ref_id, name: project_name },
    },
  };
}

export async function createServer(
  input: CreateServerInput,
  actingPeopleId: string
): Promise<Server> {
  return withTransaction(async (tx) => {
    const environmentCheck = await tx.query(
      `SELECT id FROM environments WHERE id = $1 AND deleted_at IS NULL`,
      [input.environment_id]
    );
    if (environmentCheck.rows.length === 0) {
      throw new ApiError(
        400,
        "environment_id does not reference an existing environment",
        "VALIDATION_ERROR",
        { field: "environment_id" }
      );
    }

    try {
      const result = await tx.query<Server>(
        `INSERT INTO servers (
           environment_id, display_name, hostname, ip_address, tech_stack,
           service_type, access_method, access_host, access_port, access_path,
           monitoring_url, notes
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          input.environment_id,
          input.display_name,
          input.hostname,
          input.ip_address ?? null,
          JSON.stringify(input.tech_stack ?? []),
          input.service_type,
          input.access_method,
          input.access_host,
          input.access_port ?? null,
          input.access_path ?? null,
          input.monitoring_url ?? null,
          input.notes ?? null,
        ]
      );
      const created = result.rows[0];
      await logActivity("server", created.id, "create", actingPeopleId, null, created, tx);
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(409, "A conflicting server already exists", "CONFLICT");
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
export async function updateServer(
  id: string,
  input: UpdateServerInput,
  actingPeopleId: string
): Promise<Server> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Server>(
      `SELECT * FROM servers WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Server not found");

    try {
      const result = await tx.query<Server>(
        `UPDATE servers
         SET display_name = COALESCE($3, display_name),
             hostname = COALESCE($4, hostname),
             ip_address = COALESCE($5, ip_address),
             tech_stack = COALESCE($6::jsonb, tech_stack),
             service_type = COALESCE($7, service_type),
             access_method = COALESCE($8, access_method),
             access_host = COALESCE($9, access_host),
             access_port = COALESCE($10, access_port),
             access_path = COALESCE($11, access_path),
             monitoring_url = COALESCE($12, monitoring_url),
             notes = COALESCE($13, notes),
             updated_at = now()
         WHERE id = $1
           AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
           AND deleted_at IS NULL
         RETURNING *`,
        [
          id,
          input.updated_at,
          input.display_name ?? null,
          input.hostname ?? null,
          input.ip_address ?? null,
          input.tech_stack ? JSON.stringify(input.tech_stack) : null,
          input.service_type ?? null,
          input.access_method ?? null,
          input.access_host ?? null,
          input.access_port ?? null,
          input.access_path ?? null,
          input.monitoring_url ?? null,
          input.notes ?? null,
        ]
      );
      const updated = result.rows[0];
      if (!updated) {
        throw new ApiError(
          409,
          "Server was modified by someone else; refresh and try again",
          "CONFLICT"
        );
      }
      await logActivity("server", updated.id, "update", actingPeopleId, existing, updated, tx);
      return updated;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(409, "A conflicting server already exists", "CONFLICT");
      }
      throw err;
    }
  });
}

/**
 * Soft-deletes the server and, in the same transaction, hard-deletes its
 * credential_references (they have no `deleted_at` by design). This data is
 * genuinely gone afterward — see restoreServer for the accepted trade-off.
 */
export async function softDeleteServer(
  id: string,
  actingPeopleId: string
): Promise<Server> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Server>(
      `SELECT * FROM servers WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Server not found");

    await tx.query(`DELETE FROM credential_references WHERE server_id = $1`, [id]);

    const result = await tx.query<Server>(
      `UPDATE servers SET deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    const deleted = result.rows[0];
    await logActivity("server", deleted.id, "delete", actingPeopleId, existing, deleted, tx);
    return deleted;
  });
}

/**
 * Restores the server row only. credential_references hard-deleted alongside
 * it during softDeleteServer are NOT restored — that data is genuinely gone,
 * an accepted trade-off of credential_references having no soft delete.
 */
export async function restoreServer(
  id: string,
  actingPeopleId: string
): Promise<Server> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Server>(
      `SELECT * FROM servers WHERE id = $1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Server not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Server is not deleted", "CONFLICT");
    }

    try {
      const result = await tx.query<Server>(
        `UPDATE servers SET deleted_at = NULL, updated_at = now()
         WHERE id = $1 AND deleted_at IS NOT NULL
         RETURNING *`,
        [id]
      );
      const restored = result.rows[0];
      await logActivity("server", restored.id, "restore", actingPeopleId, existing, restored, tx);
      return restored;
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(409, "A conflicting server already exists", "CONFLICT");
      }
      throw err;
    }
  });
}
