import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Person } from "../types";
import {
  CreatePersonInput,
  LinkClientInput,
  UpdatePersonInput,
} from "../validators/people.validator";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const UNIQUE_VIOLATION = "23505";

export interface LinkedClientSummary {
  id: string;
  name: string;
  relationship_type: string | null;
}

export interface AccountSummary {
  id: string;
  username: string;
  active: boolean;
}

export interface PersonDetail extends Person {
  clients: LinkedClientSummary[];
  account: AccountSummary | null;
}

export interface ListPeopleParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  type?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListPeopleResult {
  data: Person[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

export async function listPeople(params: ListPeopleParams): Promise<ListPeopleResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.deletedMode === "true") {
    conditions.push("deleted_at IS NOT NULL");
  } else if (params.deletedMode === "false") {
    conditions.push("deleted_at IS NULL");
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }

  if (params.type) {
    values.push(params.type);
    conditions.push(`type = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? params.sort : "name";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM people ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query<Person>(
    `SELECT * FROM people ${where}
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

export async function getPersonById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<PersonDetail> {
  const deletedCondition = opts.includeDeleted ? "" : "AND deleted_at IS NULL";
  const personResult = await pool.query<Person>(
    `SELECT * FROM people WHERE id = $1 ${deletedCondition}`,
    [id]
  );
  const person = personResult.rows[0];
  if (!person) throw new ApiError(404, "Person not found");

  const clientsResult = await pool.query<LinkedClientSummary>(
    `SELECT c.id, c.name, pc.relationship_type
     FROM people_clients pc
     JOIN clients c ON c.id = pc.client_id
     WHERE pc.people_id = $1
     ORDER BY c.name`,
    [id]
  );

  const accountResult = await pool.query<{ id: string; username: string; deleted_at: string | null }>(
    `SELECT id, username, deleted_at FROM users WHERE people_id = $1`,
    [id]
  );
  const accountRow = accountResult.rows[0];

  return {
    ...person,
    clients: clientsResult.rows,
    account: accountRow
      ? { id: accountRow.id, username: accountRow.username, active: accountRow.deleted_at === null }
      : null,
  };
}

export async function createPerson(
  input: CreatePersonInput,
  actingPeopleId: string
): Promise<Person> {
  return withTransaction(async (tx) => {
    const result = await tx.query<Person>(
      `INSERT INTO people (name, email, phone, type, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.name, input.email ?? null, input.phone ?? null, input.type, input.notes ?? null]
    );
    const created = result.rows[0];
    await logActivity("people", created.id, "create", actingPeopleId, null, created, tx);
    return created;
  });
}

/**
 * The `updated_at` comparison truncates to milliseconds because the value round-trips
 * through JSON/JS Date, which only carries millisecond precision, while the column
 * stores microseconds — a naive equality check would reject nearly every legitimate
 * update as "stale".
 */
export async function updatePerson(
  id: string,
  input: UpdatePersonInput,
  actingPeopleId: string
): Promise<Person> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Person>(
      `SELECT * FROM people WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Person not found");

    const result = await tx.query<Person>(
      `UPDATE people
       SET name = COALESCE($3, name),
           email = COALESCE($4, email),
           phone = COALESCE($5, phone),
           type = COALESCE($6, type),
           notes = COALESCE($7, notes),
           updated_at = now()
       WHERE id = $1
         AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
         AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.updated_at,
        input.name ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.type ?? null,
        input.notes ?? null,
      ]
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new ApiError(
        409,
        "Person was modified by someone else; refresh and try again",
        "CONFLICT"
      );
    }
    await logActivity("people", updated.id, "update", actingPeopleId, existing, updated, tx);
    return updated;
  });
}

/**
 * Soft-deletes the person and, if a linked (non-deleted) user account exists,
 * disables it in the SAME transaction by soft-deleting the users row too —
 * this blocks login (see auth.service.findUserByUsername's `deleted_at IS NULL`
 * filter) without destroying the account. project_people and activity_logs
 * rows referencing this person are left untouched (historical record).
 */
export async function softDeletePerson(id: string, actingPeopleId: string): Promise<Person> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Person>(
      `SELECT * FROM people WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Person not found");

    const deletedResult = await tx.query<Person>(
      `UPDATE people SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    const deleted = deletedResult.rows[0];
    await logActivity("people", deleted.id, "delete", actingPeopleId, existing, deleted, tx);

    const userResult = await tx.query(
      `SELECT * FROM users WHERE people_id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const linkedUser = userResult.rows[0];
    if (linkedUser) {
      const disabledUserResult = await tx.query(
        `UPDATE users SET deleted_at = now(), updated_at = now() WHERE id = $1 RETURNING *`,
        [linkedUser.id]
      );
      const disabledUser = disabledUserResult.rows[0];
      await logActivity("user", disabledUser.id, "update", actingPeopleId, linkedUser, disabledUser, tx);
    }

    return deleted;
  });
}

/**
 * Restores the person and, if a linked user account exists and is currently
 * disabled, restores it too. Simplifying assumption: this treats disable/restore
 * as 1:1 — a user independently soft-deleted for unrelated reasons before the
 * person was soft-deleted would also get restored here. Accepted trade-off.
 */
export async function restorePerson(id: string, actingPeopleId: string): Promise<Person> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Person>(`SELECT * FROM people WHERE id = $1`, [id]);
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Person not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Person is not deleted", "CONFLICT");
    }

    const restoredResult = await tx.query<Person>(
      `UPDATE people SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [id]
    );
    const restored = restoredResult.rows[0];
    await logActivity("people", restored.id, "restore", actingPeopleId, existing, restored, tx);

    const userResult = await tx.query(
      `SELECT * FROM users WHERE people_id = $1 AND deleted_at IS NOT NULL`,
      [id]
    );
    const linkedUser = userResult.rows[0];
    if (linkedUser) {
      const restoredUserResult = await tx.query(
        `UPDATE users SET deleted_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`,
        [linkedUser.id]
      );
      const restoredUser = restoredUserResult.rows[0];
      await logActivity("user", restoredUser.id, "update", actingPeopleId, linkedUser, restoredUser, tx);
    }

    return restored;
  });
}

export async function listPersonClients(peopleId: string): Promise<LinkedClientSummary[]> {
  const result = await pool.query<LinkedClientSummary>(
    `SELECT c.id, c.name, pc.relationship_type
     FROM people_clients pc
     JOIN clients c ON c.id = pc.client_id
     WHERE pc.people_id = $1
     ORDER BY c.name`,
    [peopleId]
  );
  return result.rows;
}

export async function linkClient(
  peopleId: string,
  input: LinkClientInput,
  actingPeopleId: string
): Promise<LinkedClientSummary> {
  return withTransaction(async (tx) => {
    const personCheck = await tx.query(
      `SELECT id FROM people WHERE id = $1 AND deleted_at IS NULL`,
      [peopleId]
    );
    if (personCheck.rows.length === 0) throw new ApiError(404, "Person not found");

    const clientCheck = await tx.query(
      `SELECT id, name FROM clients WHERE id = $1 AND deleted_at IS NULL`,
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
      const result = await tx.query(
        `INSERT INTO people_clients (people_id, client_id, relationship_type)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [peopleId, input.client_id, input.relationship_type ?? null]
      );
      const link = result.rows[0];
      await logActivity("people", peopleId, "update", actingPeopleId, null, link, tx);
      return {
        id: clientCheck.rows[0].id,
        name: clientCheck.rows[0].name,
        relationship_type: link.relationship_type,
      };
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(409, "This client is already linked to this person", "CONFLICT");
      }
      throw err;
    }
  });
}

export async function unlinkClient(
  peopleId: string,
  clientId: string,
  actingPeopleId: string
): Promise<void> {
  return withTransaction(async (tx) => {
    const result = await tx.query(
      `DELETE FROM people_clients WHERE people_id = $1 AND client_id = $2 RETURNING *`,
      [peopleId, clientId]
    );
    const removed = result.rows[0];
    if (!removed) throw new ApiError(404, "Client relationship not found");
    await logActivity("people", peopleId, "update", actingPeopleId, removed, null, tx);
  });
}

export interface PersonForClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  deleted_at: string | null;
  relationship_type: string | null;
}

/** Reverse lookup used by GET /api/clients/:id/people (Clients module, Part 10 addition). */
export async function listPeopleForClient(clientId: string): Promise<PersonForClient[]> {
  const result = await pool.query<PersonForClient>(
    `SELECT p.id, p.name, p.email, p.phone, p.type, p.deleted_at, pc.relationship_type
     FROM people_clients pc
     JOIN people p ON p.id = pc.people_id
     WHERE pc.client_id = $1
     ORDER BY p.name`,
    [clientId]
  );
  return result.rows;
}
