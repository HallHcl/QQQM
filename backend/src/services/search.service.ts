import { pool } from "../db/pool";

/** The four DELIVERY-group entities this search covers. Nothing else. */
export type SearchEntityType = "client" | "project" | "environment" | "server";

export interface SearchHit {
  id: string;
  type: SearchEntityType;
  /** Primary identifying text — what the palette renders as the result title. */
  label: string;
  /**
   * One distinguishing field so two similarly-named results can be told apart:
   * the client's status, the project's client, the environment's project, the
   * server's IP. Null when the underlying column is null.
   */
  secondary: string | null;
}

export interface SearchResults {
  clients: SearchHit[];
  projects: SearchHit[];
  environments: SearchHit[];
  servers: SearchHit[];
  total: number;
}

/**
 * Confirmed in Task 0. Five per type fills a palette viewport with all four
 * groups visible without scrolling; the cap is applied per-entity inside the
 * query, not by truncating a merged list, so a flood of client matches can
 * never starve the server group.
 */
export const DEFAULT_LIMIT_PER_TYPE = 5;
export const MAX_LIMIT_PER_TYPE = 20;

/**
 * Builds the prefix-matching tsquery for a user's raw input.
 *
 * Every token gets `:*` because this backs a type-ahead: the user is still
 * mid-word on the last keystroke, and plain `to_tsquery('proj')` matches the
 * lexeme "proj" — not "Project Atlas". Tokens are split on anything that is
 * not a letter or digit and re-joined with `&`, which also means user input can
 * never carry tsquery operators (`!`, `|`, `<->`, parens) into to_tsquery and
 * provoke a syntax error.
 *
 * Returns null when nothing survives tokenisation (e.g. "***"), in which case
 * the caller skips the full-text half and relies on ILIKE alone.
 */
export function buildTsQuery(term: string): string | null {
  const tokens = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `${token}:*`).join(" & ");
}

/**
 * Relevance score, shared by all four entity branches so ranking is consistent
 * across groups. Highest wins:
 *
 *   1.0       exact match on the primary field (case-insensitive)
 *   0.5       primary field starts with the term
 *   +ts_rank  full-text relevance over the prose fields
 *   0.1       floor, so a substring-only hit (a hostname/IP match FTS cannot
 *             see) still scores above zero
 *
 * The bands are additive and deliberately far apart: ts_rank returns well under
 * 0.5 for realistic documents, so an exact match always outranks a prefix
 * match, which always outranks a body-text match.
 */
function score(primaryColumn: string, tsvExpression: string): string {
  return `(
      CASE WHEN lower(${primaryColumn}) = lower($1) THEN 1.0 ELSE 0 END
    + CASE WHEN lower(${primaryColumn}) LIKE lower($1) || '%' THEN 0.5 ELSE 0 END
    + CASE WHEN $2::text IS NOT NULL
             THEN ts_rank(${tsvExpression}, to_tsquery('english', $2))
             ELSE 0 END
    + 0.1
  )`;
}

/**
 * The full-text document for each entity, expressed against the alias each
 * branch query uses.
 *
 * These MUST stay character-for-character in step with the GIN index
 * expressions in migration 007 (modulo the alias prefix, which Postgres
 * normalises away) or the planner will silently fall back to a sequential
 * scan.
 */
function prose(alias: string, columns: string[]): string {
  const parts = columns.map((column) => `coalesce(${alias}.${column}, '')`);
  return `to_tsvector('english', ${parts.join(" || ' ' || ")})`;
}

interface EntityBranch {
  type: SearchEntityType;
  sql: string;
}

/**
 * Each branch is `SELECT id, label, secondary, score` over one table, already
 * filtered, ranked and limited. They run as four separate statements rather
 * than one UNION so a per-type LIMIT is expressible without a window function,
 * and so a change to one entity's field list cannot perturb another's plan.
 *
 * Positional parameters are identical across branches:
 *   $1 raw term (exact / prefix / ILIKE), $2 tsquery or null, $3 per-type limit
 *
 * Soft-deleted rows are excluded everywhere — all four are soft-delete tables
 * and a deleted row must never be navigable from search.
 */
const BRANCHES: EntityBranch[] = [
  {
    type: "client",
    sql: `
      SELECT c.id, c.name AS label, c.status AS secondary,
             ${score("c.name", prose("c", ["name", "description"]))} AS score
      FROM clients c
      WHERE c.deleted_at IS NULL
        AND (
          c.name ILIKE '%' || $1 || '%'
          OR c.description ILIKE '%' || $1 || '%'
          OR ($2::text IS NOT NULL
              AND ${prose("c", ["name", "description"])} @@ to_tsquery('english', $2))
        )
      ORDER BY score DESC, c.name ASC
      LIMIT $3`,
  },
  {
    type: "project",
    sql: `
      SELECT p.id, p.name AS label, cl.name AS secondary,
             ${score("p.name", prose("p", ["name", "description"]))} AS score
      FROM projects p
      JOIN clients cl ON cl.id = p.client_id
      WHERE p.deleted_at IS NULL
        AND (
          p.name ILIKE '%' || $1 || '%'
          OR p.description ILIKE '%' || $1 || '%'
          OR ($2::text IS NOT NULL
              AND ${prose("p", ["name", "description"])} @@ to_tsquery('english', $2))
        )
      ORDER BY score DESC, p.name ASC
      LIMIT $3`,
  },
  {
    type: "environment",
    sql: `
      SELECT e.id, e.name AS label, pr.name AS secondary,
             ${score("e.name", prose("e", ["name", "description"]))} AS score
      FROM environments e
      JOIN projects pr ON pr.id = e.project_id
      WHERE e.deleted_at IS NULL
        AND (
          e.name ILIKE '%' || $1 || '%'
          OR e.description ILIKE '%' || $1 || '%'
          OR ($2::text IS NOT NULL
              AND ${prose("e", ["name", "description"])} @@ to_tsquery('english', $2))
        )
      ORDER BY score DESC, e.name ASC
      LIMIT $3`,
  },
  {
    // Servers are the reason this search is hybrid rather than pure FTS:
    // hostname and ip_address are matched by substring because the 'english'
    // parser tokenises them as single opaque host/numeric units, so `prod`
    // finds nothing in `web-prod-01.example.com` and `10.0.2` finds nothing in
    // an INET. ip_address is INET and must be rendered with host() before
    // ILIKE. tech_stack is a JSONB array, matched via its text form so a stack
    // entry ("nginx") finds the server.
    type: "server",
    sql: `
      SELECT s.id, s.display_name AS label,
             COALESCE(host(s.ip_address), s.hostname) AS secondary,
             ${score("s.display_name", prose("s", ["display_name", "hostname", "notes"]))} AS score
      FROM servers s
      WHERE s.deleted_at IS NULL
        AND (
          s.display_name ILIKE '%' || $1 || '%'
          OR s.hostname ILIKE '%' || $1 || '%'
          OR host(s.ip_address) ILIKE '%' || $1 || '%'
          OR s.tech_stack::text ILIKE '%' || $1 || '%'
          OR s.notes ILIKE '%' || $1 || '%'
          OR ($2::text IS NOT NULL
              AND ${prose("s", ["display_name", "hostname", "notes"])} @@ to_tsquery('english', $2))
        )
      ORDER BY score DESC, s.display_name ASC
      LIMIT $3`,
  },
];

interface BranchRow {
  id: string;
  label: string;
  secondary: string | null;
}

export async function searchDelivery(
  term: string,
  limitPerType: number = DEFAULT_LIMIT_PER_TYPE
): Promise<SearchResults> {
  const trimmed = term.trim();
  // An empty query is a valid request that returns nothing — the palette's
  // resting state — not an error. Guarded here so no query is issued at all.
  if (trimmed.length === 0) {
    return { clients: [], projects: [], environments: [], servers: [], total: 0 };
  }

  const limit = Math.min(MAX_LIMIT_PER_TYPE, Math.max(1, limitPerType));
  const values = [trimmed, buildTsQuery(trimmed), limit];

  const results = await Promise.all(
    BRANCHES.map((branch) => pool.query<BranchRow>(branch.sql, values))
  );

  const [clients, projects, environments, servers] = results.map((result, index) =>
    result.rows.map<SearchHit>((row) => ({
      id: row.id,
      type: BRANCHES[index].type,
      label: row.label,
      secondary: row.secondary,
    }))
  );

  return {
    clients,
    projects,
    environments,
    servers,
    total: clients.length + projects.length + environments.length + servers.length,
  };
}
