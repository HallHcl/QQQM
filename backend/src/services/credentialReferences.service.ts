import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { CredentialReference } from "../types";
import {
  CreateCredentialReferenceInput,
  UpdateCredentialReferenceInput,
} from "../validators/credentialReferences.validator";

export async function listCredentialReferences(
  serverId?: string
): Promise<CredentialReference[]> {
  if (serverId) {
    const result = await pool.query<CredentialReference>(
      `SELECT * FROM credential_references WHERE server_id = $1 ORDER BY label`,
      [serverId]
    );
    return result.rows;
  }
  const result = await pool.query<CredentialReference>(
    `SELECT * FROM credential_references ORDER BY label`
  );
  return result.rows;
}

export async function getCredentialReferenceById(
  id: string
): Promise<CredentialReference | null> {
  const result = await pool.query<CredentialReference>(
    `SELECT * FROM credential_references WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createCredentialReference(
  data: CreateCredentialReferenceInput,
  client: PoolClient
): Promise<CredentialReference> {
  const result = await client.query<CredentialReference>(
    `INSERT INTO credential_references (server_id, label, reference_location, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.server_id, data.label, data.reference_location, data.notes ?? null]
  );
  return result.rows[0];
}

export async function updateCredentialReference(
  id: string,
  data: UpdateCredentialReferenceInput,
  client: PoolClient
): Promise<CredentialReference | null> {
  const result = await client.query<CredentialReference>(
    `UPDATE credential_references
     SET server_id = COALESCE($2, server_id),
         label = COALESCE($3, label),
         reference_location = COALESCE($4, reference_location),
         notes = COALESCE($5, notes)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      data.server_id ?? null,
      data.label ?? null,
      data.reference_location ?? null,
      data.notes ?? null,
    ]
  );
  return result.rows[0] ?? null;
}

export async function hardDeleteCredentialReference(
  id: string,
  client: PoolClient
): Promise<CredentialReference | null> {
  const result = await client.query<CredentialReference>(
    `DELETE FROM credential_references WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] ?? null;
}
