import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createCredentialReferenceSchema,
  updateCredentialReferenceSchema,
} from "../validators/credentialReferences.validator";
import {
  createCredentialReference,
  getCredentialReferenceById,
  hardDeleteCredentialReference,
  listCredentialReferences,
  updateCredentialReference,
} from "../services/credentialReferences.service";

export async function list(req: Request, res: Response) {
  const serverId = typeof req.query.server_id === "string" ? req.query.server_id : undefined;
  const references = await listCredentialReferences(serverId);
  res.json(references);
}

export async function create(req: Request, res: Response) {
  const input = createCredentialReferenceSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createCredentialReference(input, tx);
    await logActivity(
      "credential_reference",
      created.id,
      "create",
      changedBy,
      null,
      created,
      tx
    );
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateCredentialReferenceSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getCredentialReferenceById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Credential reference not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateCredentialReference(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Credential reference not found");
    await logActivity(
      "credential_reference",
      updated.id,
      "update",
      changedBy,
      existing,
      updated,
      tx
    );
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getCredentialReferenceById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Credential reference not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await hardDeleteCredentialReference(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Credential reference not found");
    await logActivity(
      "credential_reference",
      existing.id,
      "delete",
      changedBy,
      existing,
      null,
      tx
    );
    return deleted;
  });

  res.json(result);
}
