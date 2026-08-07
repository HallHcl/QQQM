import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `ProjectTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_projects_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;

let clientId: string;
let clientName: string;
let otherClientId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];

async function createClientAsAdmin(name: string) {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name });
  if (res.status === 201) createdClientIds.push(res.body.id);
  return res;
}

async function createProjectAsAdmin(body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
  if (res.status === 201) createdProjectIds.push(res.body.id);
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

  // Test 1: create the fixture client(s) via the real Clients API.
  clientName = `${PREFIX}Client`;
  const clientRes = await createClientAsAdmin(clientName);
  if (clientRes.status !== 201) {
    throw new Error(`Failed to create fixture client: ${JSON.stringify(clientRes.body)}`);
  }
  clientId = clientRes.body.id;

  const otherClientRes = await createClientAsAdmin(`${PREFIX}OtherClient`);
  otherClientId = otherClientRes.body.id;
});

afterAll(async () => {
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

describe("POST /api/projects", () => {
  it("creates a project as admin with a valid client_id (201)", async () => {
    const res = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}Alpha` });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${PREFIX}Alpha`);
    expect(res.body.client_id).toBe(clientId);
    expect(res.body.owner_status).toBe("active");
    expect(res.body.deleted_at).toBeNull();
  });

  it("returns 403 FORBIDDEN when a member (non-admin) tries to create a project", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ client_id: clientId, name: `${PREFIX}ShouldNotExist` });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 VALIDATION_ERROR for a non-existent client_id", async () => {
    const res = await createProjectAsAdmin({
      client_id: "00000000-0000-0000-0000-000000000000",
      name: `${PREFIX}OrphanProject`,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 CONFLICT for a duplicate (client_id, name)", async () => {
    const res = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}Alpha` });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("allows the SAME name under a DIFFERENT client_id (201, per-client scoping)", async () => {
    const res = await createProjectAsAdmin({ client_id: otherClientId, name: `${PREFIX}Alpha` });

    expect(res.status).toBe(201);
    expect(res.body.client_id).toBe(otherClientId);
  });
});

describe("GET /api/projects?client_id=", () => {
  it("returns only that client's projects", async () => {
    const res = await request(app)
      .get("/api/projects")
      .query({ client_id: clientId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((p: { client_id: string }) => p.client_id === clientId)).toBe(true);
  });
});

describe("PATCH /api/projects/:id (optimistic concurrency)", () => {
  it("updates a project when updated_at matches (200)", async () => {
    const createRes = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}PatchTarget` });
    const project = createRes.body;

    const patchRes = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "patched", updated_at: project.updated_at });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.description).toBe("patched");
    expect(patchRes.body.updated_at).not.toBe(project.updated_at);
  });

  it("returns 409 CONFLICT when updated_at is stale (regression test for the Part 10 precision bug)", async () => {
    const createRes = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}StaleTarget` });
    const project = createRes.body;
    const staleUpdatedAt = project.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });
});

describe("DELETE and restore", () => {
  it("soft-deletes then GET by id 404s; GET ?deleted=true shows it", async () => {
    const createRes = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}ToDelete` });
    const project = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);

    const listDeleted = await request(app)
      .get("/api/projects")
      .query({ client_id: clientId, deleted: "true", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listDeleted.body.data.some((p: { id: string }) => p.id === project.id)).toBe(true);
  });

  it("allows creating a new project with the same (client_id, name) as a soft-deleted one", async () => {
    const name = `${PREFIX}Recreate`;
    const createRes = await createProjectAsAdmin({ client_id: clientId, name });
    expect(createRes.status).toBe(201);
    const original = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/projects/${original.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const recreateRes = await createProjectAsAdmin({ client_id: clientId, name });
    expect(recreateRes.status).toBe(201);
    expect(recreateRes.body.id).not.toBe(original.id);
  });

  it("restores a deleted project (200); restoring again returns 409 CONFLICT", async () => {
    const createRes = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}Restorable` });
    const project = createRes.body;
    await request(app)
      .delete(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const restoreRes = await request(app)
      .post(`/api/projects/${project.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/projects/${project.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });
});

describe("activity_logs coverage for the project lifecycle", () => {
  it("has a row for create, update, delete, and restore performed in this suite", async () => {
    const createRes = await createProjectAsAdmin({
      client_id: clientId,
      name: `${PREFIX}ActivityLifecycle`,
    });
    const project = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "for activity log check", updated_at: project.updated_at });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/projects/${project.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'project' AND entity_id = $1 ORDER BY created_at`,
      [project.id]
    );
    const actions = logs.rows.map((r) => r.action);

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");
  });
});

describe("GET /api/projects/:id (parent client inline)", () => {
  it("includes the parent client's id and name inline", async () => {
    const createRes = await createProjectAsAdmin({ client_id: clientId, name: `${PREFIX}WithClient` });
    const project = createRes.body;

    const getRes = await request(app)
      .get(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.client).toEqual({ id: clientId, name: clientName });
  });
});
