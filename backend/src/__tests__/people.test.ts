import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `PplTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_people_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let otherClientId: string;

const createdClientIds: string[] = [];
const createdPersonIds: string[] = [];
const createdUserIds: string[] = [];

async function createPersonAs(token: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/people")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  if (res.status === 201) createdPersonIds.push(res.body.id);
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

  // A people record is required: activity_logs.changed_by (via requireChangedBy)
  // is NOT NULL and FKs to people(id).
  const personRow = await pool.query<{ id: string }>(
    `INSERT INTO people (name, type) VALUES ($1, 'internal_engineer') RETURNING id`,
    [`Test Member ${RUN_ID}`]
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

  const clientRes = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}Client` });
  clientId = clientRes.body.id;
  createdClientIds.push(clientId);

  const otherClientRes = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}OtherClient` });
  otherClientId = otherClientRes.body.id;
  createdClientIds.push(otherClientId);
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await pool.query(`DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])`, [createdUserIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [createdUserIds]);
  }
  if (createdPersonIds.length > 0) {
    await pool.query(`DELETE FROM people_clients WHERE people_id = ANY($1::uuid[])`, [createdPersonIds]);
  }
  if (createdClientIds.length > 0) {
    await pool.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [createdClientIds]);
  }
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [memberUserId]);
  // People are never deleted here: activity_logs.changed_by FKs to people(id)
  // ON DELETE RESTRICT (append-only audit trail), and this suite's mutations
  // logged against memberPersonId and the created test people.
  await pool.end();
});

describe("CRUD", () => {
  it("creates a person as admin (201)", async () => {
    const res = await createPersonAs(adminToken, {
      name: `${PREFIX}Alice`,
      email: `alice_${RUN_ID}@example.com`,
      type: "internal_engineer",
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`${PREFIX}Alice`);
    expect(res.body.deleted_at).toBeNull();
  });

  it("creates a person as member (201) — RBAC allows admin or member", async () => {
    const res = await createPersonAs(memberToken, {
      name: `${PREFIX}MemberCreated`,
      type: "vendor",
    });

    expect(res.status).toBe(201);
  });

  it("reads a person (200)", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}ReadMe`, type: "approver" });

    const res = await request(app)
      .get(`/api/people/${createRes.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe(`${PREFIX}ReadMe`);
  });

  it("updates a person with correct updated_at (200)", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}UpdateMe`, type: "approver" });
    const person = createRes.body;

    const res = await request(app)
      .patch(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ notes: "updated", updated_at: person.updated_at });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("updated");
  });

  it("returns 409 CONFLICT when updated_at is stale", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}StaleTarget`, type: "approver" });
    const person = createRes.body;
    const staleUpdatedAt = person.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });

  it("soft-deletes then GET by id 404s; GET ?deleted=true shows it; restore reverses it", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}DeleteMe`, type: "approver" });
    const person = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);

    const listDeleted = await request(app)
      .get("/api/people")
      .query({ search: `${PREFIX}DeleteMe`, deleted: "true" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listDeleted.body.data.some((p: { id: string }) => p.id === person.id)).toBe(true);

    const restoreRes = await request(app)
      .post(`/api/people/${person.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/people/${person.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });

  it("has activity_logs rows for create/update/delete/restore", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}ActivityLifecycle`, type: "approver" });
    const person = createRes.body;

    await request(app)
      .patch(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "for activity check", updated_at: person.updated_at });
    await request(app)
      .delete(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/people/${person.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'people' AND entity_id = $1 ORDER BY created_at`,
      [person.id]
    );
    const actions = logs.rows.map((r) => r.action);
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");
  });
});

describe("people <-> clients", () => {
  it("[1] links a client to a person (201)", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}LinkTarget1`, type: "client_contact" });
    const person = createRes.body;

    const res = await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: clientId, relationship_type: "primary contact" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(clientId);
    expect(res.body.relationship_type).toBe("primary contact");
  });

  it("[2] linking the SAME client again returns 409 CONFLICT", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}LinkTarget2`, type: "client_contact" });
    const person = createRes.body;

    await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: clientId });

    const res = await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: clientId });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("[3] unlinking removes the relationship (200)", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}LinkTarget3`, type: "client_contact" });
    const person = createRes.body;

    await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: clientId });

    const unlinkRes = await request(app)
      .delete(`/api/people/${person.id}/clients/${clientId}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(unlinkRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.body.some((c: { id: string }) => c.id === clientId)).toBe(false);
  });

  it("[4] GET /api/people/:id includes linked clients", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}LinkTarget4`, type: "client_contact" });
    const person = createRes.body;

    await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: clientId, relationship_type: "billing" });

    const res = await request(app)
      .get(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.clients).toEqual([
      { id: clientId, name: `${PREFIX}Client`, relationship_type: "billing" },
    ]);
  });

  it("[5] GET /api/clients/:id/people (reverse lookup, added this pass)", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}LinkTarget5`, type: "client_contact" });
    const person = createRes.body;

    await request(app)
      .post(`/api/people/${person.id}/clients`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ client_id: otherClientId, relationship_type: "escalation" });

    const res = await request(app)
      .get(`/api/clients/${otherClientId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(
      res.body.some(
        (p: { id: string; relationship_type: string }) =>
          p.id === person.id && p.relationship_type === "escalation"
      )
    ).toBe(true);
  });
});

describe("users <-> people", () => {
  it("[6] a person with no linked user has account: null", async () => {
    const createRes = await createPersonAs(adminToken, { name: `${PREFIX}NoAccount`, type: "vendor" });

    const res = await request(app)
      .get(`/api/people/${createRes.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.account).toBeNull();
  });

  it("[7] a person WITH a linked user has account present and active:true", async () => {
    const res = await request(app)
      .get(`/api/people/${memberPersonId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.account).toEqual({
      id: memberUserId,
      username: MEMBER_USERNAME,
      active: true,
    });
  });

  it("[8] the DB rejects a second user linked to the same people_id (unique index confirmed)", async () => {
    await expect(
      pool.query(
        `INSERT INTO users (people_id, username, email, password_hash) VALUES ($1, $2, $3, $4)`,
        [memberPersonId, `${MEMBER_USERNAME}_dup`, `dup_${RUN_ID}@example.com`, "irrelevant-hash"]
      )
    ).rejects.toThrow(/duplicate key|unique constraint/i);
  });

  it("[9] hard-deleting a user directly leaves the linked person untouched", async () => {
    const personRow = await pool.query<{ id: string }>(
      `INSERT INTO people (name, type) VALUES ($1, 'vendor') RETURNING id`,
      [`${PREFIX}HardDeleteUserOwner`]
    );
    const personId = personRow.rows[0].id;
    createdPersonIds.push(personId);

    const hash = await bcrypt.hash("temp12345", 10);
    const userRow = await pool.query<{ id: string }>(
      `INSERT INTO users (people_id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [personId, `${PREFIX}temp_user_${RUN_ID}`, `temp_${RUN_ID}@example.com`, hash]
    );
    await pool.query(`DELETE FROM users WHERE id = $1`, [userRow.rows[0].id]);

    const res = await request(app)
      .get(`/api/people/${personId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.account).toBeNull();
  });

  it("[10] soft-deleting a person with a linked user disables login; person stays queryable via ?deleted=true", async () => {
    const personRow = await pool.query<{ id: string }>(
      `INSERT INTO people (name, type) VALUES ($1, 'internal_engineer') RETURNING id`,
      [`${PREFIX}CascadeOwner`]
    );
    const personId = personRow.rows[0].id;
    createdPersonIds.push(personId);

    const username = `${PREFIX}cascade_user_${RUN_ID}`;
    const password = "cascadePass123";
    const hash = await bcrypt.hash(password, 10);
    const userRow = await pool.query<{ id: string }>(
      `INSERT INTO users (people_id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [personId, username, `${username}@example.com`, hash]
    );
    createdUserIds.push(userRow.rows[0].id);

    const preLogin = await request(app).post("/api/auth/login").send({ username, password });
    expect(preLogin.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/people/${personId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const userAfter = await pool.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [userRow.rows[0].id]
    );
    expect(userAfter.rows[0].deleted_at).not.toBeNull();

    const postLogin = await request(app).post("/api/auth/login").send({ username, password });
    expect(postLogin.status).toBe(401);
    expect(postLogin.body.error.code).toBe("UNAUTHORIZED");

    const personRes = await request(app)
      .get("/api/people")
      .query({ search: `${PREFIX}CascadeOwner`, deleted: "true" })
      .set("Authorization", `Bearer ${adminToken}`);
    const found = personRes.body.data.find((p: { id: string }) => p.id === personId);
    expect(found).toBeDefined();
    expect(found.name).toBe(`${PREFIX}CascadeOwner`);
    expect(found.deleted_at).not.toBeNull();

    const userLog = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'user' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userRow.rows[0].id]
    );
    expect(userLog.rows[0].action).toBe("update");

    // [11] restoring the person also restores the linked user's login.
    const restoreRes = await request(app)
      .post(`/api/people/${personId}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const userAfterRestore = await pool.query<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM users WHERE id = $1`,
      [userRow.rows[0].id]
    );
    expect(userAfterRestore.rows[0].deleted_at).toBeNull();

    const loginAfterRestore = await request(app).post("/api/auth/login").send({ username, password });
    expect(loginAfterRestore.status).toBe(200);
  });
});

describe("filtering, pagination, sorting", () => {
  const filterPrefix = `${PREFIX}Filter-`;

  beforeAll(async () => {
    await createPersonAs(adminToken, { name: `${filterPrefix}A`, email: `a_${RUN_ID}@example.com`, type: "vendor" });
    await createPersonAs(adminToken, { name: `${filterPrefix}B`, email: `b_${RUN_ID}@example.com`, type: "approver" });
    await createPersonAs(adminToken, { name: `${filterPrefix}C`, email: `c_${RUN_ID}@example.com`, type: "vendor" });
  });

  it("filters by type", async () => {
    const res = await request(app)
      .get("/api/people")
      .query({ search: filterPrefix, type: "vendor", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((p: { type: string }) => p.type === "vendor")).toBe(true);
  });

  it("searches by name and email", async () => {
    const byName = await request(app)
      .get("/api/people")
      .query({ search: `${filterPrefix}B` })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byName.body.data.some((p: { name: string }) => p.name === `${filterPrefix}B`)).toBe(true);

    const byEmail = await request(app)
      .get("/api/people")
      .query({ search: `a_${RUN_ID}@example.com` })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(byEmail.body.data.some((p: { name: string }) => p.name === `${filterPrefix}A`)).toBe(true);
  });

  it("paginates and sorts", async () => {
    const res = await request(app)
      .get("/api/people")
      .query({ search: filterPrefix, per_page: 2, page: 1, sort: "name", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual([
      `${filterPrefix}A`,
      `${filterPrefix}B`,
    ]);
  });
});
