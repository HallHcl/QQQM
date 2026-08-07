import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `EnvTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_envs_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;

let clientId: string;
let projectId: string;
let projectName: string;
let otherProjectId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];

async function createEnvironmentAsAdmin(body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/environments")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
  if (res.status === 201) createdEnvironmentIds.push(res.body.id);
  return res;
}

beforeAll(async () => {
  const roleRow = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'member' AND deleted_at IS NULL`
  );
  if (roleRow.rows.length === 0) {
    throw new Error("Seeded 'member' role not found. Run `npm run seed` first.");
  }
  const memberRoleId = roleRow.rows[0].id;

  const memberHash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  const memberRow = await pool.query<{ id: string }>(
    `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [MEMBER_USERNAME, `${MEMBER_USERNAME}@example.com`, memberHash]
  );
  memberUserId = memberRow.rows[0].id;
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
    memberUserId,
    memberRoleId,
  ]);

  const adminLogin = await request(app)
    .post("/api/auth/login")
    .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  adminToken = adminLogin.body.token;

  const memberLogin = await request(app)
    .post("/api/auth/login")
    .send({ username: MEMBER_USERNAME, password: MEMBER_PASSWORD });
  memberToken = memberLogin.body.token;

  // Test 1: fixture client -> project via the real APIs.
  const clientRes = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}Client` });
  if (clientRes.status !== 201) {
    throw new Error(`Failed to create fixture client: ${JSON.stringify(clientRes.body)}`);
  }
  clientId = clientRes.body.id;
  createdClientIds.push(clientId);

  projectName = `${PREFIX}Project`;
  const projectRes = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ client_id: clientId, name: projectName });
  if (projectRes.status !== 201) {
    throw new Error(`Failed to create fixture project: ${JSON.stringify(projectRes.body)}`);
  }
  projectId = projectRes.body.id;
  createdProjectIds.push(projectId);

  const otherProjectRes = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ client_id: clientId, name: `${PREFIX}OtherProject` });
  otherProjectId = otherProjectRes.body.id;
  createdProjectIds.push(otherProjectId);
});

afterAll(async () => {
  if (createdEnvironmentIds.length > 0) {
    await pool.query(`DELETE FROM environments WHERE id = ANY($1::uuid[])`, [createdEnvironmentIds]);
  }
  if (createdProjectIds.length > 0) {
    await pool.query(`DELETE FROM projects WHERE id = ANY($1::uuid[])`, [createdProjectIds]);
  }
  if (createdClientIds.length > 0) {
    await pool.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [createdClientIds]);
  }
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [memberUserId]);
  await pool.end();
});

describe("POST /api/environments", () => {
  it("creates an environment as admin with a valid project_id (201)", async () => {
    const res = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}PROD` });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${PREFIX}PROD`);
    expect(res.body.project_id).toBe(projectId);
    expect(res.body.deleted_at).toBeNull();
  });

  it("returns 403 FORBIDDEN when a member (non-admin) tries to create an environment", async () => {
    const res = await request(app)
      .post("/api/environments")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ project_id: projectId, name: `${PREFIX}ShouldNotExist` });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 VALIDATION_ERROR for a non-existent project_id", async () => {
    const res = await createEnvironmentAsAdmin({
      project_id: "00000000-0000-0000-0000-000000000000",
      name: `${PREFIX}OrphanEnv`,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("uniqueness of (project_id, name)", () => {
  it("returns 409 CONFLICT when the SAME project already has an environment with this name", async () => {
    const res = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}PROD` });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("allows the SAME name under a DIFFERENT project (201, scoped uniqueness)", async () => {
    const res = await createEnvironmentAsAdmin({ project_id: otherProjectId, name: `${PREFIX}PROD` });

    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(otherProjectId);
  });
});

describe("GET /api/environments?project_id=", () => {
  it("returns only that project's environments", async () => {
    const res = await request(app)
      .get("/api/environments")
      .query({ project_id: projectId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((e: { project_id: string }) => e.project_id === projectId)).toBe(true);
  });
});

describe("PATCH /api/environments/:id (optimistic concurrency)", () => {
  it("updates an environment when updated_at matches (200)", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}PatchTarget` });
    const env = createRes.body;

    const patchRes = await request(app)
      .patch(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "patched", updated_at: env.updated_at });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.description).toBe("patched");
    expect(patchRes.body.updated_at).not.toBe(env.updated_at);
  });

  it("returns 409 CONFLICT when updated_at is stale", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}StaleTarget` });
    const env = createRes.body;
    const staleUpdatedAt = env.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });

  it("returns 400 VALIDATION_ERROR when attempting to change project_id", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}ReparentTarget` });
    const env = createRes.body;

    const res = await request(app)
      .patch(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ project_id: otherProjectId, updated_at: env.updated_at });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE and restore", () => {
  it("soft-deletes then GET by id 404s; GET ?deleted=true shows it", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}ToDelete` });
    const env = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);

    const listDeleted = await request(app)
      .get("/api/environments")
      .query({ project_id: projectId, deleted: "true", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listDeleted.body.data.some((e: { id: string }) => e.id === env.id)).toBe(true);
  });

  it("restores a deleted environment (200); restoring again returns 409 CONFLICT", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}Restorable` });
    const env = createRes.body;
    await request(app)
      .delete(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const restoreRes = await request(app)
      .post(`/api/environments/${env.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/environments/${env.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });
});

describe("GET /api/environments/:id (parent project inline)", () => {
  it("includes the parent project's id and name inline", async () => {
    const createRes = await createEnvironmentAsAdmin({ project_id: projectId, name: `${PREFIX}WithProject` });
    const env = createRes.body;

    const getRes = await request(app)
      .get(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.project).toEqual({ id: projectId, name: projectName });
  });
});

describe("activity_logs coverage for the environment lifecycle", () => {
  it("has a row for create, update, delete, and restore performed in this suite", async () => {
    const createRes = await createEnvironmentAsAdmin({
      project_id: projectId,
      name: `${PREFIX}ActivityLifecycle`,
    });
    const env = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "for activity log check", updated_at: env.updated_at });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/environments/${env.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'environment' AND entity_id = $1 ORDER BY created_at`,
      [env.id]
    );
    const actions = logs.rows.map((r) => r.action);

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");
  });
});
