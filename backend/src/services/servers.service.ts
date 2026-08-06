import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { Server } from "../types";
import { CreateServerInput, UpdateServerInput } from "../validators/servers.validator";

export async function listServers(environmentId?: string): Promise<Server[]> {
  if (environmentId) {
    const result = await pool.query<Server>(
      `SELECT * FROM servers WHERE deleted_at IS NULL AND environment_id = $1 ORDER BY hostname`,
      [environmentId]
    );
    return result.rows;
  }
  const result = await pool.query<Server>(
    `SELECT * FROM servers WHERE deleted_at IS NULL ORDER BY hostname`
  );
  return result.rows;
}

export async function getServerById(id: string): Promise<Server | null> {
  const result = await pool.query<Server>(
    `SELECT * FROM servers WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createServer(
  data: CreateServerInput,
  client: PoolClient
): Promise<Server> {
  const result = await client.query<Server>(
    `INSERT INTO servers (environment_id, hostname, ip_address, tech_stack, monitoring_url, notes)
     VALUES ($1, $2, $3, COALESCE($4, '[]')::jsonb, $5, $6)
     RETURNING *`,
    [
      data.environment_id,
      data.hostname,
      data.ip_address ?? null,
      data.tech_stack ? JSON.stringify(data.tech_stack) : null,
      data.monitoring_url ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0];
}

export async function updateServer(
  id: string,
  data: UpdateServerInput,
  client: PoolClient
): Promise<Server | null> {
  const result = await client.query<Server>(
    `UPDATE servers
     SET environment_id = COALESCE($2, environment_id),
         hostname = COALESCE($3, hostname),
         ip_address = COALESCE($4, ip_address),
         tech_stack = COALESCE($5, tech_stack),
         monitoring_url = COALESCE($6, monitoring_url),
         notes = COALESCE($7, notes),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [
      id,
      data.environment_id ?? null,
      data.hostname ?? null,
      data.ip_address ?? null,
      data.tech_stack ? JSON.stringify(data.tech_stack) : null,
      data.monitoring_url ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function softDeleteServer(
  id: string,
  client: PoolClient
): Promise<Server | null> {
  const result = await client.query<Server>(
    `UPDATE servers SET deleted_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
