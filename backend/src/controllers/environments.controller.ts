import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createEnvironmentSchema,
  updateEnvironmentSchema,
} from "../validators/environments.validator";
import {
  createEnvironment,
  getEnvironmentById,
  listEnvironments,
  ListEnvironmentsParams,
  restoreEnvironment,
  softDeleteEnvironment,
  updateEnvironment,
} from "../services/environments.service";

const SORTABLE_COLUMNS = new Set(["name", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);

function parseListQuery(req: Request): ListEnvironmentsParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const sortParam = String(req.query.sort ?? "name");
  const sort = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "name";
  const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const projectId = typeof req.query.project_id === "string" && req.query.project_id.length > 0
    ? req.query.project_id
    : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, projectId, deletedMode };
}

export async function list(req: Request, res: Response) {
  const result = await listEnvironments(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const environment = await getEnvironmentById(paramId(req, "id"));
  res.json(environment);
}

export async function create(req: Request, res: Response) {
  const parseResult = createEnvironmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createEnvironment(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "project_id")) {
    throw new ApiError(
      400,
      "project_id cannot be changed via update",
      "VALIDATION_ERROR",
      { field: "project_id" }
    );
  }

  const parseResult = updateEnvironmentSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateEnvironment(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeleteEnvironment(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restoreEnvironment(paramId(req, "id"), changedBy);
  res.json(restored);
}
