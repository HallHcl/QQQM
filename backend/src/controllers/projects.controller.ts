import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../validators/projects.validator";
import {
  createProject,
  getProjectById,
  listProjects,
  softDeleteProject,
  updateProject,
} from "../services/projects.service";

export async function list(req: Request, res: Response) {
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;
  const projects = await listProjects(clientId);
  res.json(projects);
}

export async function getOne(req: Request, res: Response) {
  const project = await getProjectById(paramId(req, "id"));
  if (!project) throw new ApiError(404, "Project not found");
  res.json(project);
}

export async function create(req: Request, res: Response) {
  const input = createProjectSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createProject(input, tx);
    await logActivity("project", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateProjectSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getProjectById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Project not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateProject(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Project not found");
    await logActivity("project", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getProjectById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Project not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteProject(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Project not found");
    await logActivity("project", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}
