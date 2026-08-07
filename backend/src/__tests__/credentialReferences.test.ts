import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `CredRefTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_credrefs_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let projectId: string;
let environmentId: string;
let serverId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdServerIds: string[] = [];

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

  const projectRes = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ client_id: clientId, name: `${PREFIX}Project` });
  projectId = projectRes.body.id;
  createdProjectIds.push(projectId);

  const environmentRes = await request(app)
    .post("/api/environments")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ project_id: projectId, name: `${PREFIX}PROD` });
  environmentId = environmentRes.body.id;
  createdEnvironmentIds.push(environmentId);

  const serverRes = await request(app)
    .post("/api/servers")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      environment_id: environmentId,
      display_name: `${PREFIX}Server`,
      hostname: `${PREFIX}server.internal`,
      service_type: "application",
      access_method: "ssh",
      access_host: "10.20.0.5",
    });
  if (serverRes.status !== 201) {
    throw new Error(`Failed to create fixture server: ${JSON.stringify(serverRes.body)}`);
  }
  serverId = serverRes.body.id;
  createdServerIds.push(serverId);
});

afterAll(async () => {
  if (createdServerIds.length > 0) {
    await pool.query(`DELETE FROM credential_references WHERE server_id = ANY($1::uuid[])`, [createdServerIds]);
    await pool.query(`DELETE FROM servers WHERE id = ANY($1::uuid[])`, [createdServerIds]);
  }
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
  // The test person is NOT deleted: activity_logs.changed_by FKs to people(id)
  // ON DELETE RESTRICT (activity_logs is append-only and must keep its audit
  // trail intact), and this suite's create/update/delete actions all logged
  // against this person.
  await pool.end();
});

describe("POST /api/servers/:serverId/credential-references", () => {
  it("creates a credential reference as member (201)", async () => {
    const res = await request(app)
      .post(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        label: "ssh-key",
        reference_location: "vault://secret/ssh",
        applies_to_access_method: "ssh",
      });

    expect(res.status).toBe(201);
    expect(res.body.server_id).toBe(serverId);
    expect(res.body.label).toBe("ssh-key");
    expect(res.body.applies_to_access_method).toBe("ssh");
  });
});

describe("GET /api/servers/:serverId/credential-references", () => {
  it("lists credential references for that server", async () => {
    const res = await request(app)
      .get(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.every((r: { server_id: string }) => r.server_id === serverId)).toBe(true);
  });
});

describe("PATCH and DELETE /api/credential-references/:id", () => {
  it("updates a credential reference (200)", async () => {
    const createRes = await request(app)
      .post(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "to-update", reference_location: "vault://secret/original" });
    const credRef = createRes.body;

    const patchRes = await request(app)
      .patch(`/api/credential-references/${credRef.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ reference_location: "vault://secret/updated" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.reference_location).toBe("vault://secret/updated");
  });

  it("hard-deletes a credential reference — the row is actually gone, not soft-deleted", async () => {
    const createRes = await request(app)
      .post(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "to-delete", reference_location: "vault://secret/delete-me" });
    const credRef = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/credential-references/${credRef.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const row = await pool.query(`SELECT id FROM credential_references WHERE id = $1`, [credRef.id]);
    expect(row.rows).toHaveLength(0);
  });

  it("returns 403 FORBIDDEN when a member tries to delete", async () => {
    const createRes = await request(app)
      .post(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "member-cannot-delete", reference_location: "vault://secret/protected" });
    const credRef = createRes.body;

    const res = await request(app)
      .delete(`/api/credential-references/${credRef.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

describe("activity_logs coverage for the credential_reference lifecycle", () => {
  it("has a row for create, update, and delete performed in this suite", async () => {
    const createRes = await request(app)
      .post(`/api/servers/${serverId}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "activity-lifecycle", reference_location: "vault://secret/activity" });
    const credRef = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/credential-references/${credRef.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "for activity log check" });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/credential-references/${credRef.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'credential_reference' AND entity_id = $1 ORDER BY created_at`,
      [credRef.id]
    );
    const actions = logs.rows.map((r) => r.action);

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
  });
});
