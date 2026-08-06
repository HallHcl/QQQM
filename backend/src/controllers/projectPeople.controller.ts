import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import { addProjectPersonSchema } from "../validators/projectPeople.validator";
import { getProjectById } from "../services/projects.service";
import {
  addPersonToProject,
  listPeopleForProject,
  removePersonFromProject,
} from "../services/projectPeople.service";

export async function list(req: Request, res: Response) {
  const people = await listPeopleForProject(paramId(req, "id"));
  res.json(people);
}

export async function add(req: Request, res: Response) {
  const input = addProjectPersonSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const project = await getProjectById(paramId(req, "id"));
  if (!project) throw new ApiError(404, "Project not found");

  const result = await withTransaction(async (tx) => {
    const created = await addPersonToProject(
      paramId(req, "id"),
      input.people_id,
      input.role_in_project,
      tx
    );
    await logActivity("project", paramId(req, "id"), "update", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const project = await getProjectById(paramId(req, "id"));
  if (!project) throw new ApiError(404, "Project not found");

  const result = await withTransaction(async (tx) => {
    const removed = await removePersonFromProject(paramId(req, "id"), paramId(req, "peopleId"), tx);
    if (!removed) throw new ApiError(404, "Project/person relationship not found");
    await logActivity("project", paramId(req, "id"), "update", changedBy, removed, null, tx);
    return removed;
  });

  res.json(result);
}
