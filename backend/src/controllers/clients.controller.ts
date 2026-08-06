import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createClientSchema,
  updateClientSchema,
} from "../validators/clients.validator";
import {
  createClient,
  getClientById,
  listClients,
  softDeleteClient,
  updateClient,
} from "../services/clients.service";

export async function list(_req: Request, res: Response) {
  const clients = await listClients();
  res.json(clients);
}

export async function getOne(req: Request, res: Response) {
  const client = await getClientById(paramId(req, "id"));
  if (!client) throw new ApiError(404, "Client not found");
  res.json(client);
}

export async function create(req: Request, res: Response) {
  const input = createClientSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createClient(input, tx);
    await logActivity("client", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateClientSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getClientById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Client not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateClient(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Client not found");
    await logActivity("client", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getClientById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Client not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteClient(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Client not found");
    await logActivity("client", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}
