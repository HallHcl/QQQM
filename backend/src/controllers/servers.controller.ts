import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createServerSchema,
  updateServerSchema,
} from "../validators/servers.validator";
import {
  createServer,
  getServerById,
  listServers,
  softDeleteServer,
  updateServer,
} from "../services/servers.service";

export async function list(req: Request, res: Response) {
  const environmentId =
    typeof req.query.environment_id === "string" ? req.query.environment_id : undefined;
  const servers = await listServers(environmentId);
  res.json(servers);
}

export async function create(req: Request, res: Response) {
  const input = createServerSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createServer(input, tx);
    await logActivity("server", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateServerSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getServerById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Server not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateServer(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Server not found");
    await logActivity("server", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getServerById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Server not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteServer(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Server not found");
    await logActivity("server", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}
