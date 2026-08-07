import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createResourceSchema,
  createResourceVersionSchema,
  updateMetadataSchema,
} from "../validators/resources.validator";
import {
  createResource,
  createVersion,
  getResourceById,
  getVersion,
  listResources,
  ListResourcesParams,
  listVersions,
  restoreResource,
  softDeleteResource,
  updateMetadata,
} from "../services/resources.service";

const SORTABLE_COLUMNS = new Set(["title", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);
const IMMUTABLE_METADATA_FIELDS = ["content", "external_url", "file_path", "type"];

function parseListQuery(req: Request): ListResourcesParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const sortParam = String(req.query.sort ?? "title");
  const sort = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "title";
  const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const search = typeof req.query.search === "string" && req.query.search.length > 0
    ? req.query.search
    : undefined;
  const projectId = typeof req.query.project_id === "string" && req.query.project_id.length > 0
    ? req.query.project_id
    : undefined;
  const type = typeof req.query.type === "string" && req.query.type.length > 0
    ? req.query.type
    : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, search, projectId, type, deletedMode };
}

function parsePageQuery(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  return { page, perPage };
}

export async function list(req: Request, res: Response) {
  const result = await listResources(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const resource = await getResourceById(paramId(req, "id"));
  res.json(resource);
}

export async function create(req: Request, res: Response) {
  const parseResult = createResourceSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createResource(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function updateMetadataHandler(req: Request, res: Response) {
  const body = req.body ?? {};
  const offendingField = IMMUTABLE_METADATA_FIELDS.find((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
  if (offendingField) {
    throw new ApiError(
      400,
      `${offendingField} cannot be changed via metadata update; use POST /:id/versions for content changes`,
      "VALIDATION_ERROR",
      { field: offendingField }
    );
  }

  const parseResult = updateMetadataSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateMetadata(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeleteResource(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restoreResource(paramId(req, "id"), changedBy);
  res.json(restored);
}

export async function listVersionsHandler(req: Request, res: Response) {
  const result = await listVersions(paramId(req, "id"), parsePageQuery(req));
  res.json(result);
}

export async function getVersionHandler(req: Request, res: Response) {
  const version = await getVersion(paramId(req, "id"), paramId(req, "versionId"));
  res.json(version);
}

export async function createVersionHandler(req: Request, res: Response) {
  const parseResult = createResourceVersionSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const result = await createVersion(paramId(req, "id"), parseResult.data, changedBy);
  res.status(201).json(result);
}
