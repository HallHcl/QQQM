import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createEnvironmentSchema,
  updateEnvironmentSchema,
} from "../validators/environments.validator";
import {
  createEnvironment,
  getEnvironmentById,
  listEnvironments,
  softDeleteEnvironment,
  updateEnvironment,
} from "../services/environments.service";

export async function list(req: Request, res: Response) {
  const projectId = typeof req.query.project_id === "string" ? req.query.project_id : undefined;
  const environments = await listEnvironments(projectId);
  res.json(environments);
}

export async function create(req: Request, res: Response) {
  const input = createEnvironmentSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createEnvironment(input, tx);
    await logActivity("environment", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateEnvironmentSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getEnvironmentById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Environment not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateEnvironment(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Environment not found");
    await logActivity("environment", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getEnvironmentById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Environment not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteEnvironment(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Environment not found");
    await logActivity("environment", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}
