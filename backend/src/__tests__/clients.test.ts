import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `ClientTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_clients_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;

const createdClientIds: string[] = [];

async function createClientAsAdmin(body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(body);
  if (res.status === 201) createdClientIds.push(res.body.id);
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
});

afterAll(async () => {
  if (createdClientIds.length > 0) {
    await pool.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [createdClientIds]);
  }
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [memberUserId]);
  await pool.end();
});

describe("POST /api/clients", () => {
  it("creates a client as admin with valid data (201, matches input)", async () => {
    const body = {
      name: `${PREFIX}Alpha`,
      status: "active",
      description: "created by test 1",
    };
    const res = await createClientAsAdmin(body);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(body.name);
    expect(res.body.status).toBe(body.status);
    expect(res.body.description).toBe(body.description);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.deleted_at).toBeNull();
  });

  it("returns 403 FORBIDDEN when a member (non-admin) tries to create a client", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: `${PREFIX}ShouldNotExist` });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 VALIDATION_ERROR for an empty name", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 CONFLICT when the name collides with an existing active client", async () => {
    const res = await createClientAsAdmin({ name: `${PREFIX}Alpha` });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("GET /api/clients (pagination)", () => {
  const pagePrefix = `${PREFIX}Page-`;

  beforeAll(async () => {
    for (let i = 1; i <= 12; i++) {
      const num = String(i).padStart(2, "0");
      const res = await createClientAsAdmin({ name: `${pagePrefix}${num}` });
      expect(res.status).toBe(201);
    }
  });

  it("returns a correct pagination object and respects page/per_page", async () => {
    const page1 = await request(app)
      .get("/api/clients")
      .query({ search: pagePrefix, per_page: 5, page: 1 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(page1.status).toBe(200);
    expect(page1.body.pagination).toEqual({
      page: 1,
      per_page: 5,
      total: 12,
      total_pages: 3,
    });
    expect(page1.body.data).toHaveLength(5);
    expect(page1.body.data.map((c: { name: string }) => c.name)).toEqual([
      `${pagePrefix}01`,
      `${pagePrefix}02`,
      `${pagePrefix}03`,
      `${pagePrefix}04`,
      `${pagePrefix}05`,
    ]);

    const page2 = await request(app)
      .get("/api/clients")
      .query({ search: pagePrefix, per_page: 5, page: 2 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(page2.status).toBe(200);
    expect(page2.body.pagination.page).toBe(2);
    expect(page2.body.data).toHaveLength(5);
    expect(page2.body.data.map((c: { name: string }) => c.name)).toEqual([
      `${pagePrefix}06`,
      `${pagePrefix}07`,
      `${pagePrefix}08`,
      `${pagePrefix}09`,
      `${pagePrefix}10`,
    ]);

    const page3 = await request(app)
      .get("/api/clients")
      .query({ search: pagePrefix, per_page: 5, page: 3 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(page3.body.data).toHaveLength(2);
    expect(page3.body.data.map((c: { name: string }) => c.name)).toEqual([
      `${pagePrefix}11`,
      `${pagePrefix}12`,
    ]);
  });

  it("filters by partial, case-insensitive name match", async () => {
    const lowerSearch = pagePrefix.toLowerCase();
    const res = await request(app)
      .get("/api/clients")
      .query({ search: lowerSearch, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(12);
    expect(
      res.body.data.every((c: { name: string }) => c.name.startsWith(pagePrefix))
    ).toBe(true);
  });
});

describe("PATCH /api/clients/:id (optimistic concurrency)", () => {
  it("updates a client and changes updated_at when updated_at matches", async () => {
    const createRes = await createClientAsAdmin({ name: `${PREFIX}PatchTarget` });
    const client = createRes.body;

    const patchRes = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "patched", updated_at: client.updated_at });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.description).toBe("patched");
    expect(patchRes.body.updated_at).not.toBe(client.updated_at);
  });

  it("returns 409 CONFLICT when updated_at is stale (concurrent editor)", async () => {
    const createRes = await createClientAsAdmin({ name: `${PREFIX}StaleTarget` });
    const client = createRes.body;
    const staleUpdatedAt = client.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });
});

describe("DELETE and restore", () => {
  it("soft-deletes a client (200, deleted_at set) and hides it from GET by id (404)", async () => {
    const createRes = await createClientAsAdmin({ name: `${PREFIX}ToDelete` });
    const client = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });

  it("includes soft-deleted clients only when deleted=true", async () => {
    const createRes = await createClientAsAdmin({ name: `${PREFIX}DeletedFilter` });
    const client = createRes.body;
    await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const withDeleted = await request(app)
      .get("/api/clients")
      .query({ search: `${PREFIX}DeletedFilter`, deleted: "true" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(withDeleted.body.data.some((c: { id: string }) => c.id === client.id)).toBe(true);

    const withoutDeleted = await request(app)
      .get("/api/clients")
      .query({ search: `${PREFIX}DeletedFilter` })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(withoutDeleted.body.data.some((c: { id: string }) => c.id === client.id)).toBe(false);
  });

  it("restores a deleted client (200, deleted_at null); restoring again returns 409 CONFLICT", async () => {
    const createRes = await createClientAsAdmin({ name: `${PREFIX}Restorable` });
    const client = createRes.body;
    await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const restoreRes = await request(app)
      .post(`/api/clients/${client.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/clients/${client.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });

  it("allows creating a new client with the same name as a soft-deleted one", async () => {
    const name = `${PREFIX}Recreate`;
    const createRes = await createClientAsAdmin({ name });
    expect(createRes.status).toBe(201);
    const original = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/clients/${original.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const recreateRes = await createClientAsAdmin({ name });
    expect(recreateRes.status).toBe(201);
    expect(recreateRes.body.name).toBe(name);
    expect(recreateRes.body.id).not.toBe(original.id);
  });
});

describe("activity_logs coverage for the client lifecycle", () => {
  it("has a row for create, update, delete, and restore performed in this suite", async () => {
    const name = `${PREFIX}ActivityLifecycle`;
    const createRes = await createClientAsAdmin({ name });
    const client = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "for activity log check", updated_at: client.updated_at });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/clients/${client.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'client' AND entity_id = $1 ORDER BY created_at`,
      [client.id]
    );
    const actions = logs.rows.map((r) => r.action);

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");
  });
});
