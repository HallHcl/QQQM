import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { PeopleClient } from "../types";

export async function listClientsForPerson(
  peopleId: string
): Promise<PeopleClient[]> {
  const result = await pool.query<PeopleClient>(
    `SELECT * FROM people_clients WHERE people_id = $1 ORDER BY created_at`,
    [peopleId]
  );
  return result.rows;
}

export async function addClientToPerson(
  peopleId: string,
  clientId: string,
  relationshipType: string | undefined,
  client: PoolClient
): Promise<PeopleClient> {
  const result = await client.query<PeopleClient>(
    `INSERT INTO people_clients (people_id, client_id, relationship_type)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [peopleId, clientId, relationshipType ?? null]
  );
  return result.rows[0];
}

export async function removeClientFromPerson(
  peopleId: string,
  clientId: string,
  client: PoolClient
): Promise<PeopleClient | null> {
  const result = await client.query<PeopleClient>(
    `DELETE FROM people_clients WHERE people_id = $1 AND client_id = $2 RETURNING *`,
    [peopleId, clientId]
  );
  return result.rows[0] ?? null;
}
