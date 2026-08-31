import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";
import { SCHEDULE_NOTES_MAX_LENGTH } from "../validators/schedules.validator";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `SchedTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_schedules_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let projectId: string;
let environmentId: string;
let serverId: string;
let assigneeId: string;
let deletedAssigneeId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdEnvironmentIds: string[] = [];
const createdServerIds: string[] = [];
const createdPersonIds: string[] = [];
const createdScheduleIds: string[] = [];

function futureDate(daysFromNow: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function validScheduleBody(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId,
    title: `${PREFIX}Task`,
    type: "PM",
    scheduled_date: futureDate(7),
    assigned_to: assigneeId,
    ...overrides,
  };
}

async function createScheduleAs(token: string, body: Record<string, unknown>) {
  const res = await request(app)
    .post("/api/schedules")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  if (res.status === 201) createdScheduleIds.push(res.body.id);
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
      access_host: "10.30.0.5",
    });
  serverId = serverRes.body.id;
  createdServerIds.push(serverId);

  const assigneeRes = await request(app)
    .post("/api/people")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}Assignee`, type: "internal_engineer" });
  assigneeId = assigneeRes.body.id;
  createdPersonIds.push(assigneeId);

  const deletedAssigneeRes = await request(app)
    .post("/api/people")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: `${PREFIX}DeletedAssignee`, type: "internal_engineer" });
  deletedAssigneeId = deletedAssigneeRes.body.id;
  createdPersonIds.push(deletedAssigneeId);
  await request(app)
    .delete(`/api/people/${deletedAssigneeId}`)
    .set("Authorization", `Bearer ${adminToken}`);
});

afterAll(async () => {
  if (createdScheduleIds.length > 0) {
    await pool.query(`DELETE FROM schedules WHERE id = ANY($1::uuid[])`, [createdScheduleIds]);
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

describe("status transitions (integration, via the real API)", () => {
  it("[8] pending -> in_progress sets started_at automatically and it persists", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;
    expect(schedule.started_at).toBeNull();

    const patchRes = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_progress", updated_at: schedule.updated_at });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe("in_progress");
    expect(patchRes.body.started_at).not.toBeNull();

    const refetch = await request(app)
      .get(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(refetch.body.started_at).toBe(patchRes.body.started_at);
  });

  it("[9] in_progress -> done sets completed_at automatically", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;

    const toInProgress = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "in_progress", updated_at: schedule.updated_at });
    expect(toInProgress.status).toBe(200);
    expect(toInProgress.body.completed_at).toBeNull();

    const toDone = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "done", updated_at: toInProgress.body.updated_at });

    expect(toDone.status).toBe(200);
    expect(toDone.body.status).toBe("done");
    expect(toDone.body.completed_at).not.toBeNull();
  });

  it("[10] an illegal transition (pending -> done directly) returns 400 VALIDATION_ERROR with a clear message", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;

    const res = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "done", updated_at: schedule.updated_at });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Cannot transition from 'pending' to 'done'");
  });

  it("[11] a body containing started_at or completed_at directly is rejected (400 VALIDATION_ERROR)", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;

    const withStartedAt = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ started_at: new Date().toISOString(), updated_at: schedule.updated_at });
    expect(withStartedAt.status).toBe(400);
    expect(withStartedAt.body.error.code).toBe("VALIDATION_ERROR");

    const withCompletedAt = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ completed_at: new Date().toISOString(), updated_at: schedule.updated_at });
    expect(withCompletedAt.status).toBe(400);
    expect(withCompletedAt.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("[12] is_overdue computed field", () => {
  it("is true for a pending schedule with a past scheduled_date", async () => {
    // Past dates aren't blocked by validation (only date validity is checked),
    // so this exercises the overdue computation directly.
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const res = await createScheduleAs(
      adminToken,
      validScheduleBody({ scheduled_date: pastDate.toISOString().slice(0, 10) })
    );

    expect(res.status).toBe(201);
    const getRes = await request(app)
      .get(`/api/schedules/${res.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.is_overdue).toBe(true);
  });

  it("becomes false once the schedule transitions to done", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const createRes = await createScheduleAs(
      adminToken,
      validScheduleBody({ scheduled_date: pastDate.toISOString().slice(0, 10) })
    );
    let schedule = createRes.body;

    const toInProgress = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_progress", updated_at: schedule.updated_at });
    schedule = toInProgress.body;

    const toDone = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "done", updated_at: schedule.updated_at });

    const getRes = await request(app)
      .get(`/api/schedules/${toDone.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.is_overdue).toBe(false);
  });

  it("is false for a schedule with a future scheduled_date", async () => {
    const res = await createScheduleAs(adminToken, validScheduleBody({ scheduled_date: futureDate(30) }));

    const getRes = await request(app)
      .get(`/api/schedules/${res.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.body.is_overdue).toBe(false);
  });
});

describe("parent requirement (project_id / server_id)", () => {
  it("[13] rejects a schedule with neither project_id nor server_id (400 VALIDATION_ERROR, caught by zod)", async () => {
    const res = await createScheduleAs(
      adminToken,
      validScheduleBody({ project_id: undefined, server_id: undefined })
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("[14] rejects assigned_to pointing at a soft-deleted person (400 VALIDATION_ERROR)", async () => {
    const res = await createScheduleAs(adminToken, validScheduleBody({ assigned_to: deletedAssigneeId }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("[15] succeeds with only project_id, only server_id, or both", async () => {
    const onlyProject = await createScheduleAs(
      adminToken,
      validScheduleBody({ project_id: projectId, server_id: undefined })
    );
    expect(onlyProject.status).toBe(201);

    const onlyServer = await createScheduleAs(
      adminToken,
      validScheduleBody({ project_id: undefined, server_id: serverId })
    );
    expect(onlyServer.status).toBe(201);

    const both = await createScheduleAs(
      adminToken,
      validScheduleBody({ project_id: projectId, server_id: serverId })
    );
    expect(both.status).toBe(201);
  });
});

describe("notes length limit", () => {
  // Imported rather than hardcoded so the tests move with the schema if the
  // limit is ever retuned. Mirrored client-side by SCHEDULE_NOTES_MAX_LENGTH
  // in ScheduleFormSheet.tsx, with the same message.
  const atLimit = "n".repeat(SCHEDULE_NOTES_MAX_LENGTH);
  const overLimit = "n".repeat(SCHEDULE_NOTES_MAX_LENGTH + 1);
  const message = `Notes must be ${SCHEDULE_NOTES_MAX_LENGTH} characters or less.`;

  it("accepts notes exactly at the limit on create (the boundary is inclusive)", async () => {
    const res = await createScheduleAs(adminToken, validScheduleBody({ notes: atLimit }));

    expect(res.status).toBe(201);
    expect(res.body.notes).toBe(atLimit);
  });

  it("rejects notes one character over the limit on create (400 VALIDATION_ERROR)", async () => {
    const res = await createScheduleAs(adminToken, validScheduleBody({ notes: overLimit }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body.error)).toContain(message);
  });

  it("rejects notes one character over the limit on update, and accepts it at the limit", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;

    const tooLong = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: overLimit, updated_at: schedule.updated_at });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(tooLong.body.error)).toContain(message);

    // The rejected write must not have consumed the optimistic-lock stamp:
    // the same updated_at still works for a valid follow-up edit.
    const ok = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: atLimit, updated_at: schedule.updated_at });

    expect(ok.status).toBe(200);
    expect(ok.body.notes).toBe(atLimit);
  });
});

describe("standard CRUD pattern", () => {
  it("creates a schedule as member (201), always with status 'pending'", async () => {
    const res = await createScheduleAs(memberToken, validScheduleBody({ title: `${PREFIX}MemberCreated` }));

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });

  it("returns 403 FORBIDDEN when a member tries to delete", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());

    const res = await request(app)
      .delete(`/api/schedules/${createRes.body.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 409 CONFLICT when updated_at is stale", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;
    const staleUpdatedAt = schedule.updated_at;

    const firstEdit = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "first editor", updated_at: staleUpdatedAt });
    expect(firstEdit.status).toBe(200);

    const secondEdit = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ notes: "second editor (stale)", updated_at: staleUpdatedAt });

    expect(secondEdit.status).toBe(409);
    expect(secondEdit.body.error.code).toBe("CONFLICT");
  });

  it("soft-deletes then GET by id 404s; GET ?deleted=true shows it; restore reverses it", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody());
    const schedule = createRes.body;

    const deleteRes = await request(app)
      .delete(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted_at).not.toBeNull();

    const getRes = await request(app)
      .get(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);

    const listDeleted = await request(app)
      .get("/api/schedules")
      .query({ project_id: projectId, deleted: "true", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listDeleted.body.data.some((s: { id: string }) => s.id === schedule.id)).toBe(true);

    const restoreRes = await request(app)
      .post(`/api/schedules/${schedule.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.deleted_at).toBeNull();

    const restoreAgainRes = await request(app)
      .post(`/api/schedules/${schedule.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreAgainRes.status).toBe(409);
    expect(restoreAgainRes.body.error.code).toBe("CONFLICT");
  });

  it("GET /:id inlines assigned_to_person, project, and server", async () => {
    const createRes = await createScheduleAs(
      adminToken,
      validScheduleBody({ project_id: projectId, server_id: serverId })
    );

    const res = await request(app)
      .get(`/api/schedules/${createRes.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.assigned_to_person.id).toBe(assigneeId);
    expect(res.body.project).toEqual({ id: projectId, name: `${PREFIX}Project` });
    expect(res.body.server).toEqual({ id: serverId, name: `${PREFIX}Server` });
  });

  it("filters by status and paginates", async () => {
    const filterPrefix = `${PREFIX}StatusFilter-`;
    await createScheduleAs(adminToken, validScheduleBody({ title: `${filterPrefix}1` }));
    await createScheduleAs(adminToken, validScheduleBody({ title: `${filterPrefix}2` }));

    const res = await request(app)
      .get("/api/schedules")
      .query({ project_id: projectId, status: "pending", per_page: 100 })
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((s: { status: string }) => s.status === "pending")).toBe(true);
    expect(res.body.pagination).toBeDefined();
  });

  it("[17] has activity_logs rows for create/update(including status transitions)/delete/restore", async () => {
    const createRes = await createScheduleAs(adminToken, validScheduleBody({ title: `${PREFIX}ActivityLifecycle` }));
    const schedule = createRes.body;

    const toInProgress = await request(app)
      .patch(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: "in_progress", updated_at: schedule.updated_at });
    expect(toInProgress.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/schedules/${schedule.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const restoreRes = await request(app)
      .post(`/api/schedules/${schedule.id}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(restoreRes.status).toBe(200);

    const logs = await pool.query<{ action: string; old_value: { status?: string }; new_value: { status?: string } }>(
      `SELECT action, old_value, new_value FROM activity_logs WHERE entity_type = 'schedule' AND entity_id = $1 ORDER BY created_at`,
      [schedule.id]
    );
    const actions = logs.rows.map((r) => r.action);
    expect(actions).toContain("create");
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
    expect(actions).toContain("restore");

    const updateLog = logs.rows.find((r) => r.action === "update");
    expect(updateLog?.old_value.status).toBe("pending");
    expect(updateLog?.new_value.status).toBe("in_progress");
  });
});
