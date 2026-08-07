import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createServerSchema,
  updateServerSchema,
} from "../validators/servers.validator";
import {
  createServer,
  getServerById,
  listServers,
  ListServersParams,
  restoreServer,
  softDeleteServer,
  updateServer,
} from "../services/servers.service";

const SORTABLE_COLUMNS = new Set(["display_name", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);

function parseListQuery(req: Request): ListServersParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const sortParam = String(req.query.sort ?? "display_name");
  const sort = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "display_name";
  const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const search = typeof req.query.search === "string" && req.query.search.length > 0
    ? req.query.search
    : undefined;
  const environmentId = typeof req.query.environment_id === "string" && req.query.environment_id.length > 0
    ? req.query.environment_id
    : undefined;
  const serviceType = typeof req.query.service_type === "string" && req.query.service_type.length > 0
    ? req.query.service_type
    : undefined;
  const accessMethod = typeof req.query.access_method === "string" && req.query.access_method.length > 0
    ? req.query.access_method
    : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, search, environmentId, serviceType, accessMethod, deletedMode };
}

export async function list(req: Request, res: Response) {
  const result = await listServers(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const server = await getServerById(paramId(req, "id"));
  res.json(server);
}

export async function create(req: Request, res: Response) {
  const parseResult = createServerSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createServer(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "environment_id")) {
    throw new ApiError(
      400,
      "environment_id cannot be changed via update",
      "VALIDATION_ERROR",
      { field: "environment_id" }
    );
  }

  const parseResult = updateServerSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateServer(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeleteServer(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restoreServer(paramId(req, "id"), changedBy);
  res.json(restored);
}
