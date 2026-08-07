import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createPersonSchema,
  linkClientSchema,
  updatePersonSchema,
} from "../validators/people.validator";
import {
  createPerson,
  getPersonById,
  linkClient,
  listPeople,
  ListPeopleParams,
  listPersonClients,
  restorePerson,
  softDeletePerson,
  unlinkClient,
  updatePerson,
} from "../services/people.service";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);

function parseListQuery(req: Request): ListPeopleParams {
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
  const type = typeof req.query.type === "string" && req.query.type.length > 0
    ? req.query.type
    : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, search, type, deletedMode };
}

export async function list(req: Request, res: Response) {
  const result = await listPeople(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const person = await getPersonById(paramId(req, "id"));
  res.json(person);
}

export async function create(req: Request, res: Response) {
  const parseResult = createPersonSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createPerson(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  const parseResult = updatePersonSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updatePerson(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeletePerson(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restorePerson(paramId(req, "id"), changedBy);
  res.json(restored);
}

export async function listClients(req: Request, res: Response) {
  const clients = await listPersonClients(paramId(req, "id"));
  res.json(clients);
}

export async function addClient(req: Request, res: Response) {
  const parseResult = linkClientSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await linkClient(paramId(req, "id"), parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function removeClient(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  await unlinkClient(paramId(req, "id"), paramId(req, "clientId"), changedBy);
  res.json({ message: "Client unlinked" });
}
