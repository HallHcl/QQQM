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
  ListClientsParams,
  restoreClient,
  softDeleteClient,
  updateClient,
} from "../services/clients.service";
import { listPeopleForClient } from "../services/people.service";

const SORTABLE_COLUMNS = new Set(["name", "status", "created_at", "updated_at"]);

function parseListQuery(req: Request): ListClientsParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const sortParam = String(req.query.sort ?? "name");
  const sort = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "name";
  const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const search = typeof req.query.search === "string" && req.query.search.length > 0
    ? req.query.search
    : undefined;
  const deleted = req.query.deleted === "true";

  return { page, perPage, sort, order, search, deleted };
}

export async function list(req: Request, res: Response) {
  const result = await listClients(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const client = await getClientById(paramId(req, "id"));
  if (!client) throw new ApiError(404, "Client not found");
  res.json(client);
}

export async function create(req: Request, res: Response) {
  const parseResult = createClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const input = parseResult.data;
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createClient(input, tx);
    await logActivity("client", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const parseResult = updateClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const input = parseResult.data;
  const changedBy = requireChangedBy(req);
  const id = paramId(req, "id");

  const existing = await getClientById(id);
  if (!existing) throw new ApiError(404, "Client not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateClient(id, input, tx);
    if (!updated) {
      throw new ApiError(
        409,
        "Client was modified by someone else; refresh and try again",
        "CONFLICT"
      );
    }
    await logActivity("client", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const id = paramId(req, "id");

  const existing = await getClientById(id);
  if (!existing) throw new ApiError(404, "Client not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteClient(id, tx);
    if (!deleted) throw new ApiError(404, "Client not found");
    await logActivity("client", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}

/**
 * Reverse lookup for people ↔ clients (added in Part 15, the People module,
 * as a read-only addition to Part 10's route list since the People module
 * needs it and the Clients module didn't expose it yet).
 */
export async function listPeople(req: Request, res: Response) {
  const people = await listPeopleForClient(paramId(req, "id"));
  res.json(people);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const id = paramId(req, "id");

  const existing = await getClientById(id, { includeDeleted: true });
  if (!existing) throw new ApiError(404, "Client not found");

  const result = await withTransaction(async (tx) => {
    const restored = await restoreClient(id, tx);
    if (!restored) {
      throw new ApiError(409, "Client is not deleted", "CONFLICT");
    }
    await logActivity("client", restored.id, "restore", changedBy, existing, restored, tx);
    return restored;
  });

  res.json(result);
}
