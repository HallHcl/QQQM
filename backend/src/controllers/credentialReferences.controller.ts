import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createCredentialReferenceSchema,
  updateCredentialReferenceSchema,
} from "../validators/credentialReferences.validator";
import {
  createCredentialReference,
  deleteCredentialReference,
  getCredentialReferenceById,
  listCredentialReferences,
  updateCredentialReference,
} from "../services/credentialReferences.service";

export async function listByServer(req: Request, res: Response) {
  const references = await listCredentialReferences(paramId(req, "serverId"));
  res.json(references);
}

export async function createForServer(req: Request, res: Response) {
  const body = { ...(req.body ?? {}), server_id: paramId(req, "serverId") };
  const parseResult = createCredentialReferenceSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createCredentialReference(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function getOne(req: Request, res: Response) {
  const reference = await getCredentialReferenceById(paramId(req, "id"));
  res.json(reference);
}

export async function update(req: Request, res: Response) {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "server_id")) {
    throw new ApiError(
      400,
      "server_id cannot be changed via update",
      "VALIDATION_ERROR",
      { field: "server_id" }
    );
  }

  const parseResult = updateCredentialReferenceSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateCredentialReference(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await deleteCredentialReference(paramId(req, "id"), changedBy);
  res.json(deleted);
}
