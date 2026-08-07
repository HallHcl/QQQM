import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import { addProjectPersonSchema } from "../validators/projectPeople.validator";
import { getProjectById } from "../services/projects.service";
import {
  addProjectPerson,
  listProjectPeople,
  removeProjectPerson,
} from "../services/projectPeople.service";

export async function list(req: Request, res: Response) {
  const people = await listProjectPeople(paramId(req, "id"));
  res.json(people);
}

export async function add(req: Request, res: Response) {
  const parseResult = addProjectPersonSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  await getProjectById(paramId(req, "id")); // throws 404 if missing/deleted

  const created = await addProjectPerson(paramId(req, "id"), parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  await getProjectById(paramId(req, "id")); // throws 404 if missing/deleted

  await removeProjectPerson(paramId(req, "id"), paramId(req, "peopleId"), changedBy);
  res.json({ message: "Person removed from project" });
}
