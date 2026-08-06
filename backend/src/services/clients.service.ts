import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Client } from "../types";
import { CreateClientInput, UpdateClientInput } from "../validators/clients.validator";

export async function listClients(): Promise<Client[]> {
  const result = await pool.query<Client>(
    `SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY name`
  );
  return result.rows;
}

export async function getClientById(id: string): Promise<Client | null> {
  const result = await pool.query<Client>(
    `SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createClient(
  data: CreateClientInput,
  client: PoolClient
): Promise<Client> {
  const result = await client.query<Client>(
    `INSERT INTO clients (name, status, description)
     VALUES ($1, COALESCE($2, 'active'), $3)
     RETURNING *`,
    [data.name, data.status ?? null, data.description ?? null]
  );
  return result.rows[0];
}

export async function updateClient(
  id: string,
  data: UpdateClientInput,
  client: PoolClient
): Promise<Client | null> {
  const result = await client.query<Client>(
    `UPDATE clients
     SET name = COALESCE($2, name),
         status = COALESCE($3, status),
         description = COALESCE($4, description),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, data.name ?? null, data.status ?? null, data.description ?? null]
  );
  return result.rows[0] ?? null;
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
