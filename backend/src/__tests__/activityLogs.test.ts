import crypto from "crypto";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";
import { updateSchedule } from "../services/schedules.service";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `ActLogTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_activitylogs_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;
let adminPeopleId: string;

let clientId: string;
let projectId: string;
let environmentId: string;
let serverId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdServerIds: string[] = [];
const createdResourceIds: string[] = [];
const createdScheduleIds: string[] = [];
const createdPersonIds: string[] = [];

beforeAll(async () => {
  const roleRow = await pool.query<{ id: string }>(
    `SELECT id FROM roles WHERE name = 'member' AND deleted_at IS NULL`
  );
  if (roleRow.rows.length === 0) {
    throw new Error("Seeded 'member' role not found. Run `npm run seed` first.");
  }
  const memberRoleId = roleRow.rows[0].id;

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
    .send({ name: `${PREFIX}Client`, description: "original description" });
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
      access_host: "10.40.0.5",
    });
  serverId = serverRes.body.id;
  createdServerIds.push(serverId);
});

afterAll(async () => {
  if (createdScheduleIds.length > 0) {
    await pool.query(`DELETE FROM schedules WHERE id = ANY($1::uuid[])`, [createdScheduleIds]);
  }
  if (createdResourceIds.length > 0) {
    await pool.query(`DELETE FROM resource_versions WHERE resource_id = ANY($1::uuid[])`, [createdResourceIds]);
    await pool.query(`DELETE FROM resources WHERE id = ANY($1::uuid[])`, [createdResourceIds]);
  }
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
  await pool.end();
});

describe("filtering", () => {
  it("[1] filters by entity_type", async () => {
    const res = await request(app)
      .get("/api/activity-logs")
      .query({ entity_type: "client", entity_id: clientId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((l: { entity_type: string }) => l.entity_type === "client")).toBe(true);
  });

  it("[2] filters by entity_id, returning only that entity's history", async () => {
    // Generate more than one history entry for this client.
    const getRes = await request(app)
      .get(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .patch(`/api/clients/${clientId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ description: "second description", updated_at: getRes.body.updated_at });

    const res = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: clientId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((l: { entity_id: string }) => l.entity_id === clientId)).toBe(true);
  });

  it("[3] filters by action (restore)", async () => {
    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}RestoreFilterClient` });
    const restoreTargetId = createRes.body.id;
    createdClientIds.push(restoreTargetId);

    await request(app).delete(`/api/clients/${restoreTargetId}`).set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/clients/${restoreTargetId}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: restoreTargetId, action: "restore", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe("restore");
  });

  it("[4] filters by changed_by", async () => {
    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}ChangedByClient` });
    createdClientIds.push(createRes.body.id);

    const res = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: createRes.body.id, changed_by: adminPeopleId, per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((l: { changed_by: string }) => l.changed_by === adminPeopleId)).toBe(true);
    expect(res.body.data[0].changed_by_person).toEqual(
      expect.objectContaining({ id: adminPeopleId })
    );
  });

  it("[5] filters by from/to date range", async () => {
    const beforeCreate = new Date();
    beforeCreate.setSeconds(beforeCreate.getSeconds() - 1);

    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}DateRangeClient` });
    createdClientIds.push(createRes.body.id);

    const afterCreate = new Date();
    afterCreate.setSeconds(afterCreate.getSeconds() + 1);

    const inRange = await request(app)
      .get("/api/activity-logs")
      .query({
        entity_id: createRes.body.id,
        from: beforeCreate.toISOString(),
        to: afterCreate.toISOString(),
      })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(inRange.body.data.length).toBeGreaterThan(0);

    const tooEarly = new Date();
    tooEarly.setFullYear(tooEarly.getFullYear() - 1);
    const outOfRange = await request(app)
      .get("/api/activity-logs")
      .query({
        entity_id: createRes.body.id,
        from: tooEarly.toISOString(),
        to: tooEarly.toISOString(),
      })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(outOfRange.body.data).toHaveLength(0);
  });

  it("[6] sort=created_at with order=desc vs order=asc returns correctly ordered results", async () => {
    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}OrderClient` });
    const orderTargetId = createRes.body.id;
    createdClientIds.push(orderTargetId);

    let current = createRes.body;
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .patch(`/api/clients/${orderTargetId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ description: `edit ${i}`, updated_at: current.updated_at });
      current = res.body;
    }

    const desc = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: orderTargetId, sort: "created_at", order: "desc", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);
    const ascendingCheck = [...desc.body.data].reverse();

    const asc = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: orderTargetId, sort: "created_at", order: "asc", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(desc.body.data.map((l: { id: string }) => l.id)).toEqual(
      asc.body.data.map((l: { id: string }) => l.id).reverse()
    );
    expect(ascendingCheck.map((l: { id: string }) => l.id)).toEqual(
      asc.body.data.map((l: { id: string }) => l.id)
    );
  });

  it("[7] pagination works correctly on a larger result set", async () => {
    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}PaginationClient` });
    const paginationTargetId = createRes.body.id;
    createdClientIds.push(paginationTargetId);

    let current = createRes.body;
    for (let i = 0; i < 9; i++) {
      const res = await request(app)
        .patch(`/api/clients/${paginationTargetId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ description: `edit ${i}`, updated_at: current.updated_at });
      current = res.body;
    }
    // 1 create + 9 updates = 10 total log rows for this entity.

    const page1 = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: paginationTargetId, per_page: 4, page: 1, sort: "created_at", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`);
    const page2 = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: paginationTargetId, per_page: 4, page: 2, sort: "created_at", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`);
    const page3 = await request(app)
      .get("/api/activity-logs")
      .query({ entity_id: paginationTargetId, per_page: 4, page: 3, sort: "created_at", order: "asc" })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(page1.body.pagination).toEqual({ page: 1, per_page: 4, total: 10, total_pages: 3 });
    expect(page1.body.data).toHaveLength(4);
    expect(page2.body.data).toHaveLength(4);
    expect(page3.body.data).toHaveLength(2);

    const allIds = [...page1.body.data, ...page2.body.data, ...page3.body.data].map(
      (l: { id: string }) => l.id
    );
    expect(new Set(allIds).size).toBe(10);
  });
});

describe("append-only enforcement (direct SQL, confirming the DB trigger)", () => {
  it("[8] a direct UPDATE is rejected by the trigger", async () => {
    const anyLog = await pool.query<{ id: string }>(`SELECT id FROM activity_logs LIMIT 1`);
    const logId = anyLog.rows[0].id;

    await expect(
      pool.query(`UPDATE activity_logs SET action = 'update' WHERE id = $1`, [logId])
    ).rejects.toThrow(/append-only/i);
  });

  it("[9] a direct DELETE is rejected by the trigger", async () => {
    const anyLog = await pool.query<{ id: string }>(`SELECT id FROM activity_logs LIMIT 1`);
    const logId = anyLog.rows[0].id;

    await expect(pool.query(`DELETE FROM activity_logs WHERE id = $1`, [logId])).rejects.toThrow(
      /append-only/i
    );
  });

  it("[10] a direct INSERT succeeds (the trigger only blocks UPDATE/DELETE)", async () => {
    const res = await pool.query(
      `INSERT INTO activity_logs (entity_type, entity_id, action, changed_by, old_value, new_value)
       VALUES ('client', $1, 'update', $2, '{}'::jsonb, '{}'::jsonb)
       RETURNING id`,
      [clientId, adminPeopleId]
    );
    expect(res.rows).toHaveLength(1);
    // Not cleaned up: activity_logs rows can never be deleted, by design.
  });
});

describe("cross-check correctness — field-by-field, not just \"a log exists\"", () => {
  it("[11] Client PATCH: old_value/new_value match exactly for name and description", async () => {
    const createRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}CrossCheckClient`, description: "before" });
    const client = createRes.body;
    createdClientIds.push(client.id);

    const patchRes = await request(app)
      .patch(`/api/clients/${client.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}CrossCheckClientRenamed`, description: "after", updated_at: client.updated_at });
    expect(patchRes.status).toBe(200);

    const log = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'client' AND entity_id = $1 AND action = 'update' ORDER BY created_at DESC LIMIT 1`,
      [client.id]
    );
    const row = log.rows[0];

    expect(row.entity_type).toBe("client");
    expect(row.entity_id).toBe(client.id);
    expect(row.action).toBe("update");
    expect(row.changed_by).toBe(adminPeopleId);
    expect(row.old_value.name).toBe(`${PREFIX}CrossCheckClient`);
    expect(row.old_value.description).toBe("before");
    expect(row.new_value.name).toBe(`${PREFIX}CrossCheckClientRenamed`);
    expect(row.new_value.description).toBe("after");
  });

  it("[12] Server soft-DELETE: action='delete', new_value.deleted_at is a non-null timestamp", async () => {
    const createRes = await request(app)
      .post("/api/servers")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        environment_id: environmentId,
        display_name: `${PREFIX}CrossCheckServer`,
        hostname: `${PREFIX}crosscheck.internal`,
        service_type: "application",
        access_method: "ssh",
        access_host: "10.40.0.6",
      });
    const server = createRes.body;
    createdServerIds.push(server.id);

    const deleteRes = await request(app)
      .delete(`/api/servers/${server.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const log = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'server' AND entity_id = $1 AND action = 'delete' ORDER BY created_at DESC LIMIT 1`,
      [server.id]
    );
    const row = log.rows[0];

    expect(row.action).toBe("delete");
    expect(row.new_value.deleted_at).toEqual(expect.any(String));
    expect(row.old_value.deleted_at).toBeNull();

    // [13] restore produces a SEPARATE log row, distinct from the delete row.
    const restoreRes = await request(app)
      .post(`/api/servers/${server.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const restoreLog = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'server' AND entity_id = $1 AND action = 'restore' ORDER BY created_at DESC LIMIT 1`,
      [server.id]
    );
    const restoreRow = restoreLog.rows[0];

    expect(restoreRow.id).not.toBe(row.id);
    expect(restoreRow.action).toBe("restore");
    expect(restoreRow.new_value.deleted_at).toBeNull();
  });

  it("[14] Resource metadata update AND version creation log distinctly (resource vs resource_version)", async () => {
    const createRes = await request(app)
      .post("/api/resources")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        project_id: projectId,
        type: "faq",
        title: `${PREFIX}CrossCheckResource`,
        content: "v1 content",
      });
    const resource = createRes.body;
    createdResourceIds.push(resource.id);

    const metaRes = await request(app)
      .patch(`/api/resources/${resource.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ category: "runbooks", updated_at: resource.updated_at });
    expect(metaRes.status).toBe(200);

    const versionRes = await request(app)
      .post(`/api/resources/${resource.id}/versions`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ content: "v2 content", commit_message: "cross-check version" });
    expect(versionRes.status).toBe(201);

    const resourceLog = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'resource' AND entity_id = $1 AND action = 'update' ORDER BY created_at DESC LIMIT 1`,
      [resource.id]
    );
    expect(resourceLog.rows[0].old_value.category).toBeNull();
    expect(resourceLog.rows[0].new_value.category).toBe("runbooks");

    const versionLog = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'resource_version' AND entity_id = $1 AND action = 'create'`,
      [versionRes.body.version.id]
    );
    expect(versionLog.rows).toHaveLength(1);
    expect(versionLog.rows[0].new_value.content).toBe("v2 content");
    expect(versionLog.rows[0].new_value.version_number).toBe(2);
    expect(versionLog.rows[0].old_value).toBeNull();
  });

  it("[15] Schedule status transition logs old/new status AND the auto-set started_at", async () => {
    const assigneeRes = await request(app)
      .post("/api/people")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}ScheduleAssignee`, type: "internal_engineer" });
    createdPersonIds.push(assigneeRes.body.id);

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 14);

    const createRes = await request(app)
      .post("/api/schedules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        project_id: projectId,
        title: `${PREFIX}CrossCheckSchedule`,
        type: "PM",
        scheduled_date: scheduledDate.toISOString().slice(0, 10),
        assigned_to: assigneeRes.body.id,
      });
    const schedule = createRes.body;
    createdScheduleIds.push(schedule.id);

    const patchRes = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_progress", updated_at: schedule.updated_at });
    expect(patchRes.status).toBe(200);

    const log = await pool.query(
      `SELECT * FROM activity_logs WHERE entity_type = 'schedule' AND entity_id = $1 AND action = 'update' ORDER BY created_at DESC LIMIT 1`,
      [schedule.id]
    );
    const row = log.rows[0];

    expect(row.old_value.status).toBe("pending");
    expect(row.new_value.status).toBe("in_progress");
    expect(row.old_value.started_at).toBeNull();
    expect(row.new_value.started_at).toEqual(expect.any(String));
  });
});

describe("[16] transaction atomicity: entity write and its activity_logs insert share one transaction", () => {
  it("rolls back the entity update if the activity_logs insert fails", async () => {
    const assigneeRes = await request(app)
      .post("/api/people")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `${PREFIX}AtomicityAssignee`, type: "internal_engineer" });
    createdPersonIds.push(assigneeRes.body.id);

    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 21);

    const createRes = await request(app)
      .post("/api/schedules")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        project_id: projectId,
        title: `${PREFIX}AtomicitySchedule`,
        type: "PM",
        scheduled_date: scheduledDate.toISOString().slice(0, 10),
        assigned_to: assigneeRes.body.id,
      });
    const schedule = createRes.body;
    createdScheduleIds.push(schedule.id);

    const beforeSnapshot = await pool.query(`SELECT * FROM schedules WHERE id = $1`, [schedule.id]);
    const logCountBefore = await pool.query(
      `SELECT COUNT(*)::int AS count FROM activity_logs WHERE entity_type = 'schedule' AND entity_id = $1`,
      [schedule.id]
    );

    // A syntactically valid UUID that does not exist in `people` — this makes
    // the schedule UPDATE succeed, but the activity_logs insert's changed_by
    // FK fails, which must roll back the whole transaction, including the
    // already-applied UPDATE.
    const bogusActingPeopleId = crypto.randomUUID();

    await expect(
      updateSchedule(schedule.id, { status: "in_progress", updated_at: schedule.updated_at }, bogusActingPeopleId)
    ).rejects.toThrow();

    const afterSnapshot = await pool.query(`SELECT * FROM schedules WHERE id = $1`, [schedule.id]);
    const logCountAfter = await pool.query(
      `SELECT COUNT(*)::int AS count FROM activity_logs WHERE entity_type = 'schedule' AND entity_id = $1`,
      [schedule.id]
    );

    expect(afterSnapshot.rows[0].status).toBe(beforeSnapshot.rows[0].status);
    expect(afterSnapshot.rows[0].started_at).toBe(beforeSnapshot.rows[0].started_at);
    expect(afterSnapshot.rows[0].updated_at.getTime()).toBe(beforeSnapshot.rows[0].updated_at.getTime());
    expect(logCountAfter.rows[0].count).toBe(logCountBefore.rows[0].count);
  });
});
