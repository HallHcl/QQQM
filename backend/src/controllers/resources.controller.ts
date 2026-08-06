import path from "path";
import { Request, Response } from "express";
import multer from "multer";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createResourceSchema,
  createResourceVersionSchema,
  updateResourceSchema,
} from "../validators/resources.validator";
import {
  getResourceById,
  insertResource,
  listResources,
  setCurrentVersion,
  softDeleteResource,
  updateResourceMetadata,
} from "../services/resources.service";
import {
  createNextVersion,
  getVersionById,
  listVersionsForResource,
} from "../services/resourceVersions.service";

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, "..", "..", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

export const upload = multer({ storage });

export async function list(req: Request, res: Response) {
  const projectId = typeof req.query.project_id === "string" ? req.query.project_id : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const resources = await listResources({ projectId, type, search });
  res.json(resources);
}

export async function getOne(req: Request, res: Response) {
  const resource = await getResourceById(paramId(req, "id"));
  if (!resource) throw new ApiError(404, "Resource not found");
  res.json(resource);
}

export async function listVersions(req: Request, res: Response) {
  const resource = await getResourceById(paramId(req, "id"));
  if (!resource) throw new ApiError(404, "Resource not found");

  const versions = await listVersionsForResource(paramId(req, "id"));
  res.json(versions);
}

export async function getVersion(req: Request, res: Response) {
  const version = await getVersionById(paramId(req, "id"), paramId(req, "versionId"));
  if (!version) throw new ApiError(404, "Resource version not found");
  res.json(version);
}

export async function create(req: Request, res: Response) {
  const input = createResourceSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const resource = await insertResource(input, tx);

    const version = await createNextVersion(
      {
        resourceId: resource.id,
        authorId: changedBy,
        content: input.content ?? null,
        externalUrl: input.external_url ?? null,
        filePath: input.file_path ?? null,
        commitMessage: input.commit_message ?? "Initial version",
      },
      tx
    );

    const updatedResource = await setCurrentVersion(resource.id, version.id, tx);

    await logActivity(
      "resource",
      updatedResource.id,
      "create",
      changedBy,
      null,
      updatedResource,
      tx
    );
    await logActivity(
      "resource_version",
      version.id,
      "create",
      changedBy,
      null,
      version,
      tx
    );

    return { ...updatedResource, currentVersion: version };
  });

  res.status(201).json(result);
}

export async function createVersion(req: Request, res: Response) {
  const input = createResourceVersionSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const resource = await getResourceById(paramId(req, "id"));
  if (!resource) throw new ApiError(404, "Resource not found");

  const result = await withTransaction(async (tx) => {
    const version = await createNextVersion(
      {
        resourceId: paramId(req, "id"),
        authorId: changedBy,
        content: input.content ?? null,
        externalUrl: input.external_url ?? null,
        filePath: input.file_path ?? null,
        commitMessage: input.commit_message ?? null,
      },
      tx
    );

    const updatedResource = await setCurrentVersion(paramId(req, "id"), version.id, tx);

    await logActivity(
      "resource_version",
      version.id,
      "create",
      changedBy,
      null,
      version,
      tx
    );
    await logActivity(
      "resource",
      updatedResource.id,
      "update",
      changedBy,
      resource,
      updatedResource,
      tx
    );

    return version;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateResourceSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getResourceById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Resource not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateResourceMetadata(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Resource not found");
    await logActivity("resource", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getResourceById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Resource not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteResource(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Resource not found");
    await logActivity("resource", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}

export async function uploadVersion(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const resource = await getResourceById(paramId(req, "id"));
  if (!resource) throw new ApiError(404, "Resource not found");

  if (!req.file) {
    throw new ApiError(400, "No file uploaded");
  }

  const relativePath = path.relative(
    path.join(__dirname, "..", ".."),
    req.file.path
  );

  const result = await withTransaction(async (tx) => {
    const version = await createNextVersion(
      {
        resourceId: paramId(req, "id"),
        authorId: changedBy,
        filePath: relativePath,
        commitMessage: req.body.commit_message ?? `Uploaded ${req.file!.originalname}`,
      },
      tx
    );

    const updatedResource = await setCurrentVersion(paramId(req, "id"), version.id, tx);

    await logActivity(
      "resource_version",
      version.id,
      "create",
      changedBy,
      null,
      version,
      tx
    );
    await logActivity(
      "resource",
      updatedResource.id,
      "update",
      changedBy,
      resource,
      updatedResource,
      tx
    );

    return version;
  });

  res.status(201).json(result);
}
