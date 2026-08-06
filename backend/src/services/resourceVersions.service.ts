import crypto from "crypto";
import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ResourceVersion } from "../types";

export async function listVersionsForResource(
  resourceId: string
): Promise<ResourceVersion[]> {
  const result = await pool.query<ResourceVersion>(
    `SELECT * FROM resource_versions WHERE resource_id = $1 ORDER BY version_number DESC`,
    [resourceId]
  );
  return result.rows;
}

export async function getVersionById(
  resourceId: string,
  versionId: string
): Promise<ResourceVersion | null> {
  const result = await pool.query<ResourceVersion>(
    `SELECT * FROM resource_versions WHERE resource_id = $1 AND id = $2`,
    [resourceId, versionId]
  );
  return result.rows[0] ?? null;
}

export interface CreateVersionParams {
  resourceId: string;
  authorId: string;
  content?: string | null;
  externalUrl?: string | null;
  filePath?: string | null;
  commitMessage?: string | null;
}

export async function createNextVersion(
  params: CreateVersionParams,
  client: PoolClient
): Promise<ResourceVersion> {
  // Lock the resource row to serialize concurrent version-number allocation.
  await client.query(`SELECT id FROM resources WHERE id = $1 FOR UPDATE`, [
    params.resourceId,
  ]);

  const maxResult = await client.query<{ next_version: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
     FROM resource_versions WHERE resource_id = $1`,
    [params.resourceId]
  );
  const nextVersion = maxResult.rows[0].next_version;

  const hashSource = params.content ?? params.filePath ?? params.externalUrl ?? "";
  const contentHash = crypto.createHash("sha256").update(hashSource).digest("hex");

  const result = await client.query<ResourceVersion>(
    `INSERT INTO resource_versions
       (resource_id, version_number, content, content_hash, external_url, file_path, commit_message, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      params.resourceId,
      nextVersion,
      params.content ?? null,
      contentHash,
      params.externalUrl ?? null,
      params.filePath ?? null,
      params.commitMessage ?? null,
      params.authorId,
    ]
  );
  return result.rows[0];
}
