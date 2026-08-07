import crypto from "crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";
import { createResource } from "../services/resources.service";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `ResTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_resources_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;
let adminPeopleId: string;

let clientId: string;
let projectId: string;
let environmentId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdResourceIds: string[] = [];

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function createResourceAs(token: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/resources")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  if (res.status === 201) createdResourceIds.push(res.body.id);
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
  adminPeopleId = adminLogin.body.user.peopleId;

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
});

afterAll(async () => {
  if (createdEnvironmentIds.length > 0) {
    await pool.query(`UPDATE environments SET vpn_resource_id = NULL WHERE id = ANY($1::uuid[])`, [
      createdEnvironmentIds,
    ]);
  }
  if (createdResourceIds.length > 0) {
    await pool.query(`DELETE FROM resource_versions WHERE resource_id = ANY($1::uuid[])`, [createdResourceIds]);
    await pool.query(`DELETE FROM resources WHERE id = ANY($1::uuid[])`, [createdResourceIds]);
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
  await pool.end();
});

describe("POST /api/resources — creation and type validation", () => {
  it("creates a runbook as admin (201), version 1, correct content_hash", async () => {
    const content = "# Runbook\nDo the thing.";
    const res = await createResourceAs(adminToken, {
      project_id: projectId,
      type: "runbook",
      title: `${PREFIX}Runbook`,
      content,
    });

    expect(res.status).toBe(201);
    expect(res.body.current_version.version_number).toBe(1);
    expect(res.body.current_version.content).toBe(content);
    expect(res.body.current_version.content_hash).toBe(sha256(content));
    expect(res.body.current_version.author.id).toBe(adminPeopleId);
  });

  it("creates a resource as member (201) — content versioning open to member", async () => {
    const res = await createResourceAs(memberToken, {
      project_id: projectId,
      type: "faq",
      title: `${PREFIX}MemberFaq`,
      content: "Q: Why? A: Because.",
    });

    expect(res.status).toBe(201);
    expect(res.body.current_version.version_number).toBe(1);
  });

  it("returns 400 VALIDATION_ERROR when content is missing for a content-required type", async () => {
    const res = await createResourceAs(adminToken, {
      type: "runbook",
      title: `${PREFIX}NoContent`,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when external_url is missing for type=link", async () => {
    const res = await createResourceAs(adminToken, {
      type: "link",
      title: `${PREFIX}NoUrl`,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a link resource with a valid https external_url (201)", async () => {
    const res = await createResourceAs(adminToken, {
      type: "link",
      title: `${PREFIX}Link`,
      external_url: "https://example.com/docs",
    });

    expect(res.status).toBe(201);
    expect(res.body.current_version.external_url).toBe("https://example.com/docs");
  });
});

describe("GET /api/resources (list) and /api/resources/:id (detail)", () => {
  it("list includes a lightweight current_version summary, not full content", async () => {
    const res = await request(app)
      .get("/api/resources")
      .query({ project_id: projectId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    const item = res.body.data.find((r: { title: string }) => r.title === `${PREFIX}Runbook`);
    expect(item).toBeDefined();
    expect(item.current_version).toEqual({
      id: expect.any(String),
      version_number: 1,
      created_at: expect.any(String),
      author: { id: adminPeopleId, name: expect.any(String) },
    });
    expect(item.current_version.content).toBeUndefined();
  });

  it("detail includes full current_version content", async () => {
    const listRes = await request(app)
      .get("/api/resources")
      .query({ project_id: projectId, search: `${PREFIX}Runbook`, per_page: 5 })
      .set("Authorization", `Bearer ${adminToken}`);
    const resourceId = listRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/resources/${resourceId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.current_version.content).toBe("# Runbook\nDo the thing.");
  });
});

describe("PATCH /api/resources/:id — metadata only, admin only", () => {
  it("returns 403 FORBIDDEN for a member", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}MetaForbidden`,
      content: "content",
    });
    const resource = createRes.body;

    const res = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ title: "Should not work", updated_at: resource.updated_at });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 409 CONFLICT when updated_at is stale (millisecond-precision regression test)", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}MetaStale`,
      content: "content",
    });
    const resource = createRes.body;
    const staleUpdatedAt = resource.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "first edit", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "second edit (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });

  it("rejects content/external_url/type in the metadata update body", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}MetaRejectContent`,
      content: "content",
    });
    const resource = createRes.body;

    const res = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "sneaky content change", updated_at: resource.updated_at });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE and restore", () => {
  it("soft-deletes then GET by id 404s; GET ?deleted=true shows it", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}ToDelete`,
      content: "content",
    });
    const resource = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);

    const listDeleted = await request(app)
      .get("/api/resources")
      .query({ search: `${PREFIX}ToDelete`, deleted: "true" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listDeleted.body.data.some((r: { id: string }) => r.id === resource.id)).toBe(true);
  });

  it("restores a deleted resource (200); restoring again returns 409 CONFLICT", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}Restorable`,
      content: "content",
    });
    const resource = createRes.body;
    await request(app)
      .delete(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const restoreRes = await request(app)
      .post(`/api/resources/${resource.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/resources/${resource.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });
});

describe("activity_logs coverage", () => {
  it("has rows for resource create/update/delete/restore and resource_version create", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}ActivityLifecycle`,
      content: "content",
    });
    const resource = createRes.body;

    const updateRes = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "activity check", updated_at: resource.updated_at });
    expect(updateRes.status).toBe(200);

    const versionRes = await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "v2 content", commit_message: "second version" });
    expect(versionRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/resources/${resource.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const resourceLogs = await pool.query<{ action: string }>(
      `SELECT action FROM activity_logs WHERE entity_type = 'resource' AND entity_id = $1 ORDER BY created_at`,
      [resource.id]
    );
    const resourceActions = resourceLogs.rows.map((r) => r.action);
    expect(resourceActions).toContain("create");
    expect(resourceActions).toContain("update");
    expect(resourceActions).toContain("delete");
    expect(resourceActions).toContain("restore");

    // Only the explicit POST /:id/versions call logs a resource_version activity —
    // the initial version created inside createResource is covered by the
    // resource's own "create" log (per spec, createResource logs entity_type:
    // 'resource' only, not a separate resource_version entry for v1).
    const versionLogs = await pool.query<{ action: string; entity_id: string }>(
      `SELECT al.action, al.entity_id FROM activity_logs al
       JOIN resource_versions rv ON rv.id = al.entity_id
       WHERE al.entity_type = 'resource_version' AND rv.resource_id = $1`,
      [resource.id]
    );
    expect(versionLogs.rows).toHaveLength(1);
    expect(versionLogs.rows[0].action).toBe("create");
  });
});

describe("versioning correctness — the highest-value tests in this module", () => {
  it("[Test 1] transaction rollback: no orphaned resource without a version", async () => {
    const bogusPeopleId = crypto.randomUUID();
    const title = `${PREFIX}RollbackTarget`;

    await expect(
      createResource(
        { type: "faq", title, content: "irrelevant", tags: [] },
        bogusPeopleId // not a real people.id -> resource_versions.author_id FK fails
      )
    ).rejects.toThrow();

    const row = await pool.query(`SELECT id FROM resources WHERE title = $1`, [title]);
    expect(row.rows).toHaveLength(0);
  });

  it("[Test 2] concurrent version creation: 5 simultaneous requests get distinct sequential version_numbers", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}Concurrent`,
      content: "v1 content",
    });
    const resource = createRes.body;

    const requests = Array.from({ length: 5 }, (_, i) =>
      request(app)
        .post(`/api/resources/${resource.id}/versions`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ content: `concurrent content ${i}`, commit_message: `concurrent-${i}` })
    );
    const responses = await Promise.all(requests);

    responses.forEach((res) => expect(res.status).toBe(201));

    const versionRows = await pool.query<{ version_number: number }>(
      `SELECT version_number FROM resource_versions WHERE resource_id = $1 ORDER BY version_number`,
      [resource.id]
    );
    const versionNumbers = versionRows.rows.map((r) => r.version_number);

    expect(versionNumbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length);
  });

  it("[Test 3] metadata update does not create a version", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}MetaNoVersion`,
      content: "v1 content",
    });
    const resource = createRes.body;

    const countBefore = await pool.query(
      `SELECT COUNT(*)::int AS count FROM resource_versions WHERE resource_id = $1`,
      [resource.id]
    );

    const patchRes = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: `${PREFIX}MetaNoVersion Renamed`, updated_at: resource.updated_at });
    expect(patchRes.status).toBe(200);

    const countAfter = await pool.query(
      `SELECT COUNT(*)::int AS count FROM resource_versions WHERE resource_id = $1`,
      [resource.id]
    );

    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
    expect(patchRes.body.current_version_id).toBe(resource.current_version.id);
  });

  it("[Test 4] content update creates a version and repoints current_version_id", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}ContentCreatesVersion`,
      content: "v1 content",
    });
    const resource = createRes.body;

    const countBefore = await pool.query(
      `SELECT COUNT(*)::int AS count FROM resource_versions WHERE resource_id = $1`,
      [resource.id]
    );

    const versionRes = await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "v2 content", commit_message: "second version" });
    expect(versionRes.status).toBe(201);
    expect(versionRes.body.version.version_number).toBe(2);

    const countAfter = await pool.query(
      `SELECT COUNT(*)::int AS count FROM resource_versions WHERE resource_id = $1`,
      [resource.id]
    );
    expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count + 1);

    const refetched = await request(app)
      .get(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(refetched.body.current_version_id).toBe(versionRes.body.version.id);
    expect(refetched.body.current_version.content).toBe("v2 content");
  });

  it("warns when new content is identical to the current version's content", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}DuplicateWarning`,
      content: "identical content",
    });
    const resource = createRes.body;

    const versionRes = await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "identical content" });

    expect(versionRes.status).toBe(201);
    expect(versionRes.body.warning).toBe("Content identical to current version");
  });
});

describe("GET /api/resources/:id/versions — git-log-style history", () => {
  it("lists versions newest-first without full content", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}History`,
      content: "v1",
    });
    const resource = createRes.body;

    await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "v2", commit_message: "second" });
    await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "v3", commit_message: "third" });

    const res = await request(app)
      .get(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((v: { version_number: number }) => v.version_number)).toEqual([3, 2, 1]);
    expect(res.body.data[0].content).toBeUndefined();
    expect(res.body.data[0].commit_message).toBe("third");
    expect(res.body.data[0].author.id).toBe(adminPeopleId);
  });

  it("GET a specific historical version returns its full content", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "faq",
      title: `${PREFIX}HistoryDetail`,
      content: "original content",
    });
    const resource = createRes.body;
    const v1Id = resource.current_version.id;

    await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "updated content" });

    const res = await request(app)
      .get(`/api/resources/${resource.id}/versions/${v1Id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.content).toBe("original content");
    expect(res.body.version_number).toBe(1);
  });
});

describe("environments.vpn_resource_id", () => {
  it("can be set via PATCH /api/environments/:id and appears in the environment response", async () => {
    const createRes = await createResourceAs(adminToken, {
      type: "link",
      title: `${PREFIX}VpnLink`,
      external_url: "https://vpn.example.com",
    });
    const resource = createRes.body;

    const envRes = await request(app)
      .get(`/api/environments/${environmentId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const patchRes = await request(app)
      .patch(`/api/environments/${environmentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vpn_resource_id: resource.id, updated_at: envRes.body.updated_at });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.vpn_resource_id).toBe(resource.id);

    const refetched = await request(app)
      .get(`/api/environments/${environmentId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(refetched.body.vpn_resource_id).toBe(resource.id);
  });
});
