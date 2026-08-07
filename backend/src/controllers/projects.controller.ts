import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../validators/projects.validator";
import {
  createProject,
  getProjectById,
  listProjects,
  ListProjectsParams,
  restoreProject,
  softDeleteProject,
  updateProject,
} from "../services/projects.service";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);

function parseListQuery(req: Request): ListProjectsParams {
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
  const clientId = typeof req.query.client_id === "string" && req.query.client_id.length > 0
    ? req.query.client_id
    : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, search, clientId, deletedMode };
}

export async function list(req: Request, res: Response) {
  const result = await listProjects(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const project = await getProjectById(paramId(req, "id"));
  res.json(project);
}

export async function create(req: Request, res: Response) {
  const parseResult = createProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createProject(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "client_id")) {
    throw new ApiError(
      400,
      "client_id cannot be changed via update",
      "VALIDATION_ERROR",
      { field: "client_id" }
    );
  }

  const parseResult = updateProjectSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateProject(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeleteProject(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restoreProject(paramId(req, "id"), changedBy);
  res.json(restored);
}
