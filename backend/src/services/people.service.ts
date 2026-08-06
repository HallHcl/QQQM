import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Person } from "../types";
import { CreatePersonInput, UpdatePersonInput } from "../validators/people.validator";

export interface ListPeopleFilters {
  type?: string;
  clientId?: string;
  search?: string;
}

export async function listPeople(filters: ListPeopleFilters): Promise<Person[]> {
  const conditions: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`p.type = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(p.name ILIKE $${params.length} OR p.email ILIKE $${params.length})`);
  }

  let joinClause = "";
  if (filters.clientId) {
    params.push(filters.clientId);
    joinClause = `JOIN people_clients pc ON pc.people_id = p.id AND pc.client_id = $${params.length}`;
  }

  const query = `
    SELECT DISTINCT p.* FROM people p
    ${joinClause}
    WHERE ${conditions.join(" AND ")}
    ORDER BY p.name
  `;

  const result = await pool.query<Person>(query, params);
  return result.rows;
}

export async function getPersonById(id: string): Promise<Person | null> {
  const result = await pool.query<Person>(
    `SELECT * FROM people WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createPerson(
  data: CreatePersonInput,
  client: PoolClient
): Promise<Person> {
  const result = await client.query<Person>(
    `INSERT INTO people (name, email, phone, type, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.email ?? null, data.phone ?? null, data.type, data.notes ?? null]
  );
  return result.rows[0];
}

export async function updatePerson(
  id: string,
  data: UpdatePersonInput,
  client: PoolClient
): Promise<Person | null> {
  const result = await client.query<Person>(
    `UPDATE people
     SET name = COALESCE($2, name),
         email = COALESCE($3, email),
         phone = COALESCE($4, phone),
         type = COALESCE($5, type),
         notes = COALESCE($6, notes),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      data.name ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.type ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function softDeletePerson(
  id: string,
  client: PoolClient
): Promise<Person | null> {
  const result = await client.query<Person>(
    `UPDATE people SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
