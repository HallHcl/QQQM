import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `SrvTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_servers_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let projectId: string;
let projectName: string;
let environmentId: string;
let environmentName: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdServerIds: string[] = [];

function validServerBody(overrides: Record<string, unknown> = {}) {
  return {
    environment_id: environmentId,
    display_name: `${PREFIX}Zabbix`,
    hostname: `zabbix-${RUN_ID}.internal`,
    service_type: "monitoring",
    access_method: "web",
    access_host: "10.10.0.15",
    access_port: 443,
    access_path: "/zabbix",
    ...overrides,
  };
}

async function createServerAs(token: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/servers")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  if (res.status === 201) createdServerIds.push(res.body.id);
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
  // is NOT NULL and FKs to people(id), so a member with no linked person can
  // authenticate but can never successfully create/update anything.
  const personRow = await pool.query<{ id: string }>(
    `INSERT INTO people (name, type) VALUES ($1, 'internal_engineer') RETURNING id`,
    [`Test Member ${RUN_ID}`]
  );
  memberPersonId = personRow.rows[0].id;

  const memberHash = await bcrypt.hash(MEMBER_PASSWORD, 10);
  const memberRow = await pool.query<{ id: string }>(
    `INSERT INTO users (people_id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [personRow.rows[0].id, MEMBER_USERNAME, `${MEMBER_USERNAME}@example.com`, memberHash]
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

  // Test 1: fixture client -> project -> environment via the real APIs.
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

  environmentName = `${PREFIX}PROD`;
  const environmentRes = await request(app)
    .post("/api/environments")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ project_id: projectId, name: environmentName });
  if (environmentRes.status !== 201) {
    throw new Error(`Failed to create fixture environment: ${JSON.stringify(environmentRes.body)}`);
  }
  environmentId = environmentRes.body.id;
  createdEnvironmentIds.push(environmentId);
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
  // trail intact), and this suite's create/update/delete/restore actions all
  // logged against this person.
  await pool.end();
});

describe("POST /api/servers", () => {
  it("succeeds as member (201) — RBAC differs from Clients/Projects/Environments which were admin-only", async () => {
    const res = await createServerAs(memberToken, validServerBody({ display_name: `${PREFIX}MemberCreated` }));

    expect(res.status).toBe(201);
    expect(res.body.display_name).toBe(`${PREFIX}MemberCreated`);
    expect(res.body.service_type).toBe("monitoring");
    expect(res.body.access_method).toBe("web");
    expect(res.body.access_host).toBe("10.10.0.15");
    expect(res.body.access_port).toBe(443);
    expect(res.body.access_path).toBe("/zabbix");
  });

  it("returns 400 VALIDATION_ERROR for an invalid service_type", async () => {
    const res = await createServerAs(
      adminToken,
      validServerBody({ display_name: `${PREFIX}BadServiceType`, service_type: "not_a_real_type" })
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR for access_port = 99999 (caught before the DB CHECK constraint)", async () => {
    const res = await createServerAs(
      adminToken,
      validServerBody({ display_name: `${PREFIX}BadPort`, access_port: 99999 })
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when access_path does not start with /", async () => {
    const res = await createServerAs(
      adminToken,
      validServerBody({ display_name: `${PREFIX}BadPath`, access_path: "zabbix" })
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("GET /api/servers/:id (breadcrumb inline context)", () => {
  it("includes inlined environment AND environment.project", async () => {
    const createRes = await createServerAs(adminToken, validServerBody({ display_name: `${PREFIX}Breadcrumb` }));
    const server = createRes.body;

    const getRes = await request(app)
      .get(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.environment).toEqual({
      id: environmentId,
      name: environmentName,
      project: { id: projectId, name: projectName },
    });
  });
});

describe("PATCH /api/servers/:id (optimistic concurrency)", () => {
  it("returns 409 CONFLICT when updated_at is stale (millisecond-precision regression test)", async () => {
    const createRes = await createServerAs(adminToken, validServerBody({ display_name: `${PREFIX}StaleTarget` }));
    const server = createRes.body;
    const staleUpdatedAt = server.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });
});

describe("DELETE cascades to credential_references; restore does not bring them back", () => {
  it("soft-deletes the server and hard-deletes its credential_references", async () => {
    const createRes = await createServerAs(adminToken, validServerBody({ display_name: `${PREFIX}CascadeDelete` }));
    const server = createRes.body;

    const crRes = await request(app)
      .post(`/api/servers/${server.id}/credential-references`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: "db-password", reference_location: "vault://secret/db" });
    expect(crRes.status).toBe(201);
    const credentialReferenceId = crRes.body.id;

    const deleteRes = await request(app)
      .delete(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const serverRow = await pool.query(`SELECT deleted_at FROM servers WHERE id = $1`, [server.id]);
    expect(serverRow.rows[0].deleted_at).not.toBeNull();

    const crRow = await pool.query(`SELECT id FROM credential_references WHERE id = $1`, [credentialReferenceId]);
    expect(crRow.rows).toHaveLength(0);

    const restoreRes = await request(app)
      .post(`/api/servers/${server.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const crRowAfterRestore = await pool.query(
      `SELECT id FROM credential_references WHERE server_id = $1`,
      [server.id]
    );
    expect(crRowAfterRestore.rows).toHaveLength(0);
  });
});

describe("activity_logs coverage for the server lifecycle", () => {
  it("has a row for create, update, delete, and restore performed in this suite", async () => {
    const createRes = await createServerAs(adminToken, validServerBody({ display_name: `${PREFIX}ActivityLifecycle` }));
    const server = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "for activity log check", updated_at: server.updated_at });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/servers/${server.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const logs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'server' AND entity_id = $1 ORDER BY created_at`,
      [server.id]
    );
    const actions = logs.rows.map((r) => r.action);

    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");
  });
});

describe("display_name backfill (migration 004)", () => {
  it("backfilled display_name = hostname for any servers that predate the migration", async () => {
    // Scoped by time relative to when 004 was actually applied (not by "rows
    // this suite didn't create") — other test files run concurrently and may
    // create servers with a deliberately different display_name/hostname,
    // which isn't a backfill case at all and shouldn't be flagged as one.
    const migrationRow = await pool.query<{ applied_at: string }>(
      `SELECT applied_at FROM schema_migrations WHERE version = '004_servers_access_fields'`
    );
    if (migrationRow.rows.length === 0) {
      throw new Error("Migration 004 has not been applied — run `npm run migrate` first.");
    }
    const appliedAt = migrationRow.rows[0].applied_at;

    const preExisting = await pool.query<{ id: string; hostname: string; display_name: string }>(
      `SELECT id, hostname, display_name FROM servers WHERE created_at < $1`,
      [appliedAt]
    );

    if (preExisting.rows.length === 0) {
      // No pre-migration server rows exist in this environment — nothing to backfill-check.
      expect(preExisting.rows).toHaveLength(0);
      return;
    }

    for (const row of preExisting.rows) {
      expect(row.display_name).toBe(row.hostname);
    }
  });
});
