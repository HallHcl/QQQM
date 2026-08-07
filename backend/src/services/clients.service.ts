import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ApiError } from "../middleware/errorHandler";
import { Client } from "../types";
import { CreateClientInput, UpdateClientInput } from "../validators/clients.validator";

const SORTABLE_COLUMNS = new Set(["name", "status", "created_at", "updated_at"]);
const UNIQUE_VIOLATION = "23505";

export interface ListClientsParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  deleted: boolean;
}

export interface ListClientsResult {
  data: Client[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

export async function listClients(
  params: ListClientsParams
): Promise<ListClientsResult> {
  const conditions: string[] = [
    params.deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL",
  ];
  const values: unknown[] = [];

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "name";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM clients ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Client>(
    `SELECT * FROM clients ${where}
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

export async function getClientById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<Client | null> {
  const deletedCondition = opts.includeDeleted ? "" : "AND deleted_at IS NULL";
  const result = await pool.query<Client>(
    `SELECT * FROM clients WHERE id = $1 ${deletedCondition}`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createClient(
  data: CreateClientInput,
  client: PoolClient
): Promise<Client> {
  try {
    const result = await client.query<Client>(
      `INSERT INTO clients (name, status, description)
       VALUES ($1, COALESCE($2, 'active'), $3)
       RETURNING *`,
      [data.name, data.status ?? null, data.description ?? null]
    );
    return result.rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ApiError(409, "A client with this name already exists", "CONFLICT");
    }
    throw err;
  }
}

/**
 * Returns null when the row exists but `updated_at` didn't match (stale write).
 * The comparison truncates to milliseconds because `updated_at` round-trips through
 * JSON/JS Date, which only carries millisecond precision, while the column stores
 * microseconds.
 */
export async function updateClient(
  id: string,
  data: UpdateClientInput,
  client: PoolClient
): Promise<Client | null> {
  try {
    const result = await client.query<Client>(
      `UPDATE clients
       SET name = COALESCE($3, name),
           status = COALESCE($4, status),
           description = COALESCE($5, description),
           updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
         AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
       RETURNING *`,
      [id, data.updated_at, data.name ?? null, data.status ?? null, data.description ?? null]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ApiError(409, "A client with this name already exists", "CONFLICT");
    }
    throw err;
  }
}

export async function softDeleteClient(
  id: string,
  client: PoolClient
): Promise<Client | null> {
  const result = await client.query<Client>(
    `UPDATE clients SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}

/** Returns null when the client exists but is not currently deleted. */
export async function restoreClient(
  id: string,
  client: PoolClient
): Promise<Client | null> {
  try {
    const result = await client.query<Client>(
      `UPDATE clients SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      throw new ApiError(
        409,
        "A client with this name already exists",
        "CONFLICT"
      );
    }
    throw err;
  }
}
