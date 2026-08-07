import crypto from "crypto";
import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { Resource, ResourceVersion } from "../types";
import {
  CreateResourceInput,
  CreateResourceVersionInput,
  UpdateMetadataInput,
} from "../validators/resources.validator";

const SORTABLE_COLUMNS = new Set(["title", "created_at", "updated_at"]);
const CONTENT_REQUIRED_TYPES = new Set(["runbook", "sop", "troubleshooting", "faq"]);

/**
 * content_hash exists ONLY for integrity verification, duplicate-content
 * detection, and audit trail. It is never a lookup key, identity, or unique
 * constraint — resource_versions.id (UUID) is the sole identity for a version.
 */
function computeContentHash(input: { content?: string | null; externalUrl?: string | null }): string {
  const source = input.content ?? input.externalUrl ?? "";
  return crypto.createHash("sha256").update(source).digest("hex");
}

function assertTypeRequirements(type: string, content?: string, externalUrl?: string) {
  if (CONTENT_REQUIRED_TYPES.has(type) && !content) {
    throw new ApiError(400, `content is required for type "${type}"`, "VALIDATION_ERROR", {
      field: "content",
    });
  }
  if (type === "link" && !externalUrl) {
    throw new ApiError(400, 'external_url is required for type "link"', "VALIDATION_ERROR", {
      field: "external_url",
    });
  }
}

export interface VersionAuthor {
  id: string;
  name: string;
}

export interface CurrentVersionSummary {
  id: string;
  version_number: number;
  created_at: string;
  author: VersionAuthor;
}

export interface CurrentVersionDetail extends CurrentVersionSummary {
  content: string | null;
  external_url: string | null;
  file_path: string | null;
  content_hash: string;
  commit_message: string | null;
}

export interface ResourceListItem extends Resource {
  current_version: CurrentVersionSummary | null;
}

export interface ResourceDetail extends Resource {
  current_version: CurrentVersionDetail | null;
}

export interface ListResourcesParams {
  page: number;
  perPage: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  projectId?: string;
  type?: string;
  deletedMode: "false" | "true" | "all";
}

export interface ListResourcesResult {
  data: ResourceListItem[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

export async function listResources(params: ListResourcesParams): Promise<ListResourcesResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.deletedMode === "true") {
    conditions.push("r.deleted_at IS NOT NULL");
  } else if (params.deletedMode === "false") {
    conditions.push("r.deleted_at IS NULL");
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(`r.title ILIKE $${values.length}`);
  }

  if (params.projectId) {
    values.push(params.projectId);
    conditions.push(`r.project_id = $${values.length}`);
  }

  if (params.type) {
    values.push(params.type);
    conditions.push(`r.type = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortColumn = SORTABLE_COLUMNS.has(params.sort) ? `r.${params.sort}` : "r.title";
  const orderDirection = params.order === "desc" ? "DESC" : "ASC";

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM resources r ${where}`,
    values
  );
  const total = Number(countResult.rows[0].count);

  const limitParamIndex = values.length + 1;
  const offsetParamIndex = values.length + 2;
  values.push(params.perPage, (params.page - 1) * params.perPage);

  const dataResult = await pool.query(
    `SELECT r.*,
            rv.id AS cv_id, rv.version_number AS cv_version_number, rv.created_at AS cv_created_at,
            au.id AS cv_author_id, au.name AS cv_author_name
     FROM resources r
     LEFT JOIN resource_versions rv ON rv.id = r.current_version_id
     LEFT JOIN people au ON au.id = rv.author_id
     ${where}
     ORDER BY ${sortColumn} ${orderDirection}
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    values
  );

  return {
    data: dataResult.rows.map(mapListRow),
    pagination: {
      page: params.page,
      per_page: params.perPage,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / params.perPage),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapListRow(row: any): ResourceListItem {
  const { cv_id, cv_version_number, cv_created_at, cv_author_id, cv_author_name, ...resource } = row;
  return {
    ...resource,
    current_version: cv_id
      ? {
          id: cv_id,
          version_number: cv_version_number,
          created_at: cv_created_at,
          author: { id: cv_author_id, name: cv_author_name },
        }
      : null,
  };
}

export async function getResourceById(
  id: string,
  opts: { includeDeleted?: boolean } = {}
): Promise<ResourceDetail> {
  const deletedCondition = opts.includeDeleted ? "" : "AND r.deleted_at IS NULL";
  const result = await pool.query(
    `SELECT r.*,
            rv.id AS cv_id, rv.version_number AS cv_version_number, rv.created_at AS cv_created_at,
            rv.content AS cv_content, rv.external_url AS cv_external_url, rv.file_path AS cv_file_path,
            rv.content_hash AS cv_content_hash, rv.commit_message AS cv_commit_message,
            au.id AS cv_author_id, au.name AS cv_author_name
     FROM resources r
     LEFT JOIN resource_versions rv ON rv.id = r.current_version_id
     LEFT JOIN people au ON au.id = rv.author_id
     WHERE r.id = $1 ${deletedCondition}`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Resource not found");

  const {
    cv_id,
    cv_version_number,
    cv_created_at,
    cv_content,
    cv_external_url,
    cv_file_path,
    cv_content_hash,
    cv_commit_message,
    cv_author_id,
    cv_author_name,
    ...resource
  } = row;

  return {
    ...resource,
    current_version: cv_id
      ? {
          id: cv_id,
          version_number: cv_version_number,
          created_at: cv_created_at,
          content: cv_content,
          external_url: cv_external_url,
          file_path: cv_file_path,
          content_hash: cv_content_hash,
          commit_message: cv_commit_message,
          author: { id: cv_author_id, name: cv_author_name },
        }
      : null,
  };
}

/**
 * The critical multi-step transaction: resources and resource_versions are
 * created together or not at all. A resource row with no version must never
 * be observable outside this function.
 */
export async function createResource(
  input: CreateResourceInput,
  actingPeopleId: string
): Promise<ResourceDetail> {
  const resourceId = await withTransaction(async (tx) => {
    if (input.project_id) {
      const projectCheck = await tx.query(
        `SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
        [input.project_id]
      );
      if (projectCheck.rows.length === 0) {
        throw new ApiError(
          400,
          "project_id does not reference an existing project",
          "VALIDATION_ERROR",
          { field: "project_id" }
        );
      }
    }

    assertTypeRequirements(input.type, input.content, input.external_url);

    const resourceResult = await tx.query<Resource>(
      `INSERT INTO resources (project_id, type, title, category, tags)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        input.project_id ?? null,
        input.type,
        input.title,
        input.category ?? null,
        JSON.stringify(input.tags ?? []),
      ]
    );
    const resource = resourceResult.rows[0];

    const contentHash = computeContentHash({
      content: input.content,
      externalUrl: input.external_url,
    });

    const versionResult = await tx.query<ResourceVersion>(
      `INSERT INTO resource_versions
         (resource_id, version_number, content, content_hash, external_url, file_path, commit_message, author_id)
       VALUES ($1, 1, $2, $3, $4, NULL, $5, $6)
       RETURNING *`,
      [
        resource.id,
        input.content ?? null,
        contentHash,
        input.external_url ?? null,
        input.commit_message ?? "Initial version",
        actingPeopleId,
      ]
    );
    const version = versionResult.rows[0];

    const updatedResourceResult = await tx.query<Resource>(
      `UPDATE resources SET current_version_id = $2 WHERE id = $1 RETURNING *`,
      [resource.id, version.id]
    );
    const updatedResource = updatedResourceResult.rows[0];

    await logActivity(
      "resource",
      updatedResource.id,
      "create",
      actingPeopleId,
      null,
      updatedResource,
      tx
    );

    return updatedResource.id;
  });

  return getResourceById(resourceId);
}

/**
 * Updates ONLY title/category/tags. Never touches content, never creates a
 * version. Same millisecond-truncated optimistic-lock pattern as other modules.
 */
export async function updateMetadata(
  id: string,
  input: UpdateMetadataInput,
  actingPeopleId: string
): Promise<Resource> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Resource>(
      `SELECT * FROM resources WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Resource not found");

    const result = await tx.query<Resource>(
      `UPDATE resources
       SET title = COALESCE($3, title),
           category = COALESCE($4, category),
           tags = COALESCE($5::jsonb, tags),
           updated_at = now()
       WHERE id = $1
         AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz)
         AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.updated_at,
        input.title ?? null,
        input.category ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
      ]
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new ApiError(
        409,
        "Resource was modified by someone else; refresh and try again",
        "CONFLICT"
      );
    }
    await logActivity("resource", updated.id, "update", actingPeopleId, existing, updated, tx);
    return updated;
  });
}

export interface CreateVersionResult {
  version: ResourceVersion;
  warning?: string;
}

/**
 * Safe under concurrent requests: SELECT ... FOR UPDATE on the parent resource
 * row serializes concurrent callers, so the next version_number is always
 * computed against a consistent, fully-committed view of prior versions —
 * no two concurrent requests can ever compute the same next number.
 */
export async function createVersion(
  resourceId: string,
  input: CreateResourceVersionInput,
  actingPeopleId: string
): Promise<CreateVersionResult> {
  return withTransaction(async (tx) => {
    const lockResult = await tx.query<{ id: string; current_version_id: string | null }>(
      `SELECT id, current_version_id FROM resources WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [resourceId]
    );
    const resource = lockResult.rows[0];
    if (!resource) throw new ApiError(404, "Resource not found");

    const nextVersionResult = await tx.query<{ next_version: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
       FROM resource_versions WHERE resource_id = $1`,
      [resourceId]
    );
    const nextVersionNumber = nextVersionResult.rows[0].next_version;

    const contentHash = computeContentHash({
      content: input.content,
      externalUrl: input.external_url,
    });

    let warning: string | undefined;
    if (resource.current_version_id) {
      const currentHashResult = await tx.query<{ content_hash: string }>(
        `SELECT content_hash FROM resource_versions WHERE id = $1`,
        [resource.current_version_id]
      );
      if (currentHashResult.rows[0]?.content_hash === contentHash) {
        warning = "Content identical to current version";
      }
    }

    const versionResult = await tx.query<ResourceVersion>(
      `INSERT INTO resource_versions
         (resource_id, version_number, content, content_hash, external_url, file_path, commit_message, author_id)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
       RETURNING *`,
      [
        resourceId,
        nextVersionNumber,
        input.content ?? null,
        contentHash,
        input.external_url ?? null,
        input.commit_message ?? null,
        actingPeopleId,
      ]
    );
    const version = versionResult.rows[0];

    await tx.query(
      `UPDATE resources SET current_version_id = $2, updated_at = now() WHERE id = $1`,
      [resourceId, version.id]
    );

    await logActivity(
      "resource_version",
      version.id,
      "create",
      actingPeopleId,
      null,
      version,
      tx
    );

    return { version, warning };
  });
}

export async function getVersion(
  resourceId: string,
  versionId: string
): Promise<ResourceVersion & { author: VersionAuthor }> {
  const result = await pool.query(
    `SELECT rv.*, au.id AS author_ref_id, au.name AS author_name
     FROM resource_versions rv
     JOIN people au ON au.id = rv.author_id
     WHERE rv.resource_id = $1 AND rv.id = $2`,
    [resourceId, versionId]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "Resource version not found");

  const { author_ref_id, author_name, ...version } = row;
  return { ...version, author: { id: author_ref_id, name: author_name } };
}

export interface ListVersionsParams {
  page: number;
  perPage: number;
}

export interface VersionSummary {
  id: string;
  version_number: number;
  commit_message: string | null;
  created_at: string;
  author: VersionAuthor;
}

export interface ListVersionsResult {
  data: VersionSummary[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
}

/** Git-log-style: version_number, author, commit_message, created_at — no content. */
export async function listVersions(
  resourceId: string,
  params: ListVersionsParams
): Promise<ListVersionsResult> {
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM resource_versions WHERE resource_id = $1`,
    [resourceId]
  );
  const total = Number(countResult.rows[0].count);

  const dataResult = await pool.query(
    `SELECT rv.id, rv.version_number, rv.commit_message, rv.created_at,
            au.id AS author_ref_id, au.name AS author_name
     FROM resource_versions rv
     JOIN people au ON au.id = rv.author_id
     WHERE rv.resource_id = $1
     ORDER BY rv.version_number DESC
     LIMIT $2 OFFSET $3`,
    [resourceId, params.perPage, (params.page - 1) * params.perPage]
  );

  return {
    data: dataResult.rows.map((row) => ({
      id: row.id,
      version_number: row.version_number,
      commit_message: row.commit_message,
      created_at: row.created_at,
      author: { id: row.author_ref_id, name: row.author_name },
    })),
    pagination: {
      page: params.page,
      per_page: params.perPage,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / params.perPage),
    },
  };
}

/**
 * Soft-deletes the resources row only. resource_versions history is never
 * touched by delete or restore — versions are immutable and permanent.
 */
export async function softDeleteResource(id: string, actingPeopleId: string): Promise<Resource> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Resource>(
      `SELECT * FROM resources WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Resource not found");

    const result = await tx.query<Resource>(
      `UPDATE resources SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    const deleted = result.rows[0];
    await logActivity("resource", deleted.id, "delete", actingPeopleId, existing, deleted, tx);
    return deleted;
  });
}

export async function restoreResource(id: string, actingPeopleId: string): Promise<Resource> {
  return withTransaction(async (tx) => {
    const existingResult = await tx.query<Resource>(`SELECT * FROM resources WHERE id = $1`, [id]);
    const existing = existingResult.rows[0];
    if (!existing) throw new ApiError(404, "Resource not found");
    if (!existing.deleted_at) {
      throw new ApiError(409, "Resource is not deleted", "CONFLICT");
    }

    const result = await tx.query<Resource>(
      `UPDATE resources SET deleted_at = NULL, updated_at = now()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING *`,
      [id]
    );
    const restored = result.rows[0];
    await logActivity("resource", restored.id, "restore", actingPeopleId, existing, restored, tx);
    return restored;
  });
}

// Exported so tests can compute an expected hash independently and compare.
export const _internal = { computeContentHash };
