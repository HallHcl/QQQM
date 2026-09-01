import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";
import { buildTsQuery } from "../services/search.service";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `SearchTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_search_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let projectId: string;
let environmentId: string;
let serverId: string;
let deletedClientId: string;

const createdServerIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdProjectIds: string[] = [];
const createdClientIds: string[] = [];

/**
 * A term unique to this run, so assertions never collide with rows left by
 * other suites or by seed data. The searchable fixtures below all embed it.
 */
const UNIQUE_TERM = `zorblat${RUN_ID}`;

async function search(term: string, query: Record<string, string> = {}) {
  return request(app)
    .get("/api/search")
    .query({ q: term, ...query })
    .set("Authorization", `Bearer ${adminToken}`);
}

beforeAll(async () => {
  const roleRow = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'member' AND deleted_at IS NULL`
  );
  if (roleRow.rows.length === 0) {
    throw new Error("Seeded 'member' role not found. Run `npm run seed` first.");
  }

  const personRow = await pool.query<{ id: string }>(
    `INSERT INTO people (name, type) VALUES ($1, 'internal_engineer') RETURNING id`,
    [`Search Member ${RUN_ID}`]
  );
  memberPersonId = personRow.rows[0].id;

  const memberHash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  const memberRow = await pool.query<{ id: string }>(
    `INSERT INTO users (people_id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [memberPersonId, MEMBER_USERNAME, `${MEMBER_USERNAME}@example.com`, memberHash]
  );
  memberUserId = memberRow.rows[0].id;
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
    memberUserId,
    roleRow.rows[0].id,
  ]);

  adminToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  ).body.token;
  memberToken = (
    await request(app)
      .post("/api/auth/login")
      .send({ username: MEMBER_USERNAME, password: MEMBER_PASSWORD })
  ).body.token;

  // One fixture per DELIVERY entity, all matching UNIQUE_TERM through a
  // different field, so a single query exercises all four branches at once.
  const clientRes = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}${UNIQUE_TERM} Client`, description: "A delivery client" });
  clientId = clientRes.body.id;
  createdClientIds.push(clientId);

  const projectRes = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      client_id: clientId,
      // Matches via description only — proves the prose fields are searched,
      // not just the name.
      name: `${PREFIX}Unrelated Project`,
      description: `Migration work for ${UNIQUE_TERM}`,
    });
  projectId = projectRes.body.id;
  createdProjectIds.push(projectId);

  const environmentRes = await request(app)
    .post("/api/environments")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ project_id: projectId, name: `${PREFIX}${UNIQUE_TERM}-PROD` });
  environmentId = environmentRes.body.id;
  createdEnvironmentIds.push(environmentId);

  const serverRes = await request(app)
    .post("/api/servers")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      environment_id: environmentId,
      display_name: `${PREFIX}${UNIQUE_TERM} Web Node`,
      hostname: `web-prod-01.${UNIQUE_TERM}.internal`,
      ip_address: "10.77.0.42",
      service_type: "application",
      access_method: "ssh",
      access_host: "10.77.0.42",
      access_port: 22,
    });
  serverId = serverRes.body.id;
  createdServerIds.push(serverId);

  // Soft-deleted client, to prove deleted rows never surface.
  const deletedRes = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}${UNIQUE_TERM} Deleted Client` });
  deletedClientId = deletedRes.body.id;
  createdClientIds.push(deletedClientId);
  await request(app)
    .delete(`/api/clients/${deletedClientId}`)
    .set("Authorization", `Bearer ${adminToken}`);
});

afterAll(async () => {
  await pool.query(`DELETE FROM servers WHERE id = ANY($1::uuid[])`, [createdServerIds]);
  await pool.query(`DELETE FROM environments WHERE id = ANY($1::uuid[])`, [
    createdEnvironmentIds,
  ]);
  await pool.query(`DELETE FROM projects WHERE id = ANY($1::uuid[])`, [createdProjectIds]);
  await pool.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [createdClientIds]);
  await pool.query(`DELETE FROM activity_logs WHERE changed_by = $1`, [memberPersonId]);
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM people WHERE id = $1`, [memberPersonId]);
  await pool.end();
});

describe("buildTsQuery", () => {
  it("prefix-matches every token so a half-typed word still matches", () => {
    expect(buildTsQuery("proj")).toBe("proj:*");
    expect(buildTsQuery("atlas prod")).toBe("atlas:* & prod:*");
  });

  it("strips tsquery operators out of user input instead of passing them through", () => {
    // `!`, `|` and parens would be a to_tsquery syntax error if forwarded.
    expect(buildTsQuery("web | !prod")).toBe("web:* & prod:*");
    expect(buildTsQuery("(atlas)")).toBe("atlas:*");
  });

  it("returns null when nothing survives tokenisation", () => {
    expect(buildTsQuery("***")).toBeNull();
    expect(buildTsQuery("   ")).toBeNull();
  });
});

describe("GET /api/search", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/search").query({ q: "anything" });
    expect(res.status).toBe(401);
  });

  it("is available to a non-admin member (read-only, no RBAC gate)", async () => {
    const res = await request(app)
      .get("/api/search")
      .query({ q: UNIQUE_TERM })
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
  });

  it("returns a hit from all four DELIVERY entities, grouped by type", async () => {
    const res = await search(UNIQUE_TERM);

    expect(res.status).toBe(200);
    expect(res.body.clients.map((h: { id: string }) => h.id)).toContain(clientId);
    expect(res.body.projects.map((h: { id: string }) => h.id)).toContain(projectId);
    expect(res.body.environments.map((h: { id: string }) => h.id)).toContain(environmentId);
    expect(res.body.servers.map((h: { id: string }) => h.id)).toContain(serverId);
  });

  it("tags each hit with its entity type and a distinguishing secondary field", async () => {
    const res = await search(UNIQUE_TERM);

    const client = res.body.clients.find((h: { id: string }) => h.id === clientId);
    expect(client.type).toBe("client");
    expect(client.secondary).toBe("active");

    // A project's secondary is its client; an environment's is its project.
    const project = res.body.projects.find((h: { id: string }) => h.id === projectId);
    expect(project.type).toBe("project");
    expect(project.secondary).toBe(`${PREFIX}${UNIQUE_TERM} Client`);

    const environment = res.body.environments.find(
      (h: { id: string }) => h.id === environmentId
    );
    expect(environment.secondary).toBe(`${PREFIX}Unrelated Project`);

    // A server's secondary is its IP, rendered by host() from INET.
    const server = res.body.servers.find((h: { id: string }) => h.id === serverId);
    expect(server.secondary).toBe("10.77.0.42");
  });

  it("matches a project through its description, not only its name", async () => {
    // The fixture project's NAME contains no UNIQUE_TERM at all.
    const res = await search(UNIQUE_TERM);
    const project = res.body.projects.find((h: { id: string }) => h.id === projectId);
    expect(project).toBeDefined();
    expect(project.label).toBe(`${PREFIX}Unrelated Project`);
  });

  it("ranks an exact name match above a mere partial match", async () => {
    const exactName = `${PREFIX}RankProbe`;
    const exact = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: exactName });
    createdClientIds.push(exact.body.id);

    const partial = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Prefixed ${exactName} Trailing` });
    createdClientIds.push(partial.body.id);

    const res = await search(exactName);
    const ids = res.body.clients.map((h: { id: string }) => h.id);

    expect(ids).toContain(exact.body.id);
    expect(ids).toContain(partial.body.id);
    // Exact match scores 1.0 + 0.5 (it also prefixes itself); the substring
    // match scores only the 0.1 floor, so ordering is deterministic.
    expect(ids.indexOf(exact.body.id)).toBeLessThan(ids.indexOf(partial.body.id));
  });

  it("finds a server by a hostname substring that full-text alone cannot match", async () => {
    // `prod` is not a lexeme of `web-prod-01.<term>.internal` — the 'english'
    // parser treats the whole thing as one host token. This is the case that
    // justifies the hybrid FTS + ILIKE query.
    const res = await search("web-prod-01");
    expect(res.body.servers.map((h: { id: string }) => h.id)).toContain(serverId);
  });

  it("finds a server by a partial IP address", async () => {
    const res = await search("10.77.0");
    expect(res.body.servers.map((h: { id: string }) => h.id)).toContain(serverId);
  });

  it("excludes soft-deleted rows", async () => {
    const res = await search(UNIQUE_TERM);
    expect(res.body.clients.map((h: { id: string }) => h.id)).not.toContain(deletedClientId);
  });

  it("returns empty groups for a term that matches nothing", async () => {
    const res = await search(`nothingmatchesthis${RUN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      clients: [],
      projects: [],
      environments: [],
      servers: [],
      total: 0,
    });
  });

  it("treats an empty or whitespace-only term as an empty result, not an error", async () => {
    for (const term of ["", "   "]) {
      const res = await search(term);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    }
  });

  it("does not blow up on input made entirely of tsquery punctuation", async () => {
    const res = await search("!!!");
    expect(res.status).toBe(200);
  });

  it("caps results at the per-type limit rather than across the whole response", async () => {
    const limitTerm = `limitprobe${RUN_ID}`;
    for (let i = 0; i < 7; i += 1) {
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: `${PREFIX}${limitTerm} ${i}` });
      createdClientIds.push(created.body.id);
    }

    const defaulted = await search(limitTerm);
    expect(defaulted.body.clients).toHaveLength(5);

    const limited = await search(limitTerm, { limit: "2" });
    expect(limited.body.clients).toHaveLength(2);
  });

  it("clamps an out-of-range limit instead of rejecting the request", async () => {
    const res = await search(UNIQUE_TERM, { limit: "9999" });
    expect(res.status).toBe(200);
    expect(res.body.clients.length).toBeLessThanOrEqual(20);
  });
});
