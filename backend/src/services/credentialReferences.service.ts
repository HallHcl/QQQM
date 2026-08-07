import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
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
): Promise<CredentialReference> {
  const result = await pool.query<CredentialReference>(
    `SELECT * FROM credential_references WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Credential reference not found");
  return row;
}

export async function createCredentialReference(
  input: CreateCredentialReferenceInput,
  actingPeopleId: string
): Promise<CredentialReference> {
  return withTransaction(async (tx) => {
    const serverCheck = await tx.query(
      `SELECT id FROM servers WHERE id = $1 AND deleted_at IS NULL`,
      [input.server_id]
    );
    if (serverCheck.rows.length === 0) {
      throw new ApiError(
        400,
        "server_id does not reference an existing server",
        "VALIDATION_ERROR",
        { field: "server_id" }
      );
    }

    const result = await tx.query<CredentialReference>(
      `INSERT INTO credential_references (server_id, label, reference_location, applies_to_access_method, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.server_id,
        input.label,
        input.reference_location,
        input.applies_to_access_method ?? null,
        input.notes ?? null,
      ]
    );
    const created = result.rows[0];
    await logActivity(
      "credential_reference",
      created.id,
      "create",
      actingPeopleId,
      null,
      created,
      tx
    );
    return created;
  });
}

export async function updateCredentialReference(
  id: string,
  input: UpdateCredentialReferenceInput,
  actingPeopleId: string
): Promise<CredentialReference> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<CredentialReference>(
      `SELECT * FROM credential_references WHERE id = $1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Credential reference not found");

    const result = await tx.query<CredentialReference>(
      `UPDATE credential_references
       SET label = COALESCE($2, label),
           reference_location = COALESCE($3, reference_location),
           applies_to_access_method = COALESCE($4, applies_to_access_method),
           notes = COALESCE($5, notes)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.label ?? null,
        input.reference_location ?? null,
        input.applies_to_access_method ?? null,
        input.notes ?? null,
      ]
    );
    const updated = result.rows[0];
    await logActivity(
      "credential_reference",
      updated.id,
      "update",
      actingPeopleId,
      existing,
      updated,
      tx
    );
    return updated;
  });
}

/** Hard delete — credential_references have no soft delete / restore by design. */
export async function deleteCredentialReference(
  id: string,
  actingPeopleId: string
): Promise<CredentialReference> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<CredentialReference>(
      `SELECT * FROM credential_references WHERE id = $1`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Credential reference not found");

    await tx.query(`DELETE FROM credential_references WHERE id = $1`, [id]);
    await logActivity(
      "credential_reference",
      existing.id,
      "delete",
      actingPeopleId,
      existing,
      null,
      tx
    );
    return existing;
  });
}
