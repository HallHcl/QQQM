import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../app";
import { pool } from "../db/pool";

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const RUN_ID = Date.now();
const PREFIX = `ProjPplTest_${RUN_ID}_`;

const MEMBER_USERNAME = `test_member_projppl_${RUN_ID}`;
const MEMBER_PASSWORD = "memberPass123";

let adminToken: string;
let memberToken: string;
let memberUserId: string;
let memberPersonId: string;

let clientId: string;
let projectId: string;
let otherProjectId: string;

const createdClientIds: string[] = [];
const createdProjectIds: string[] = [];
const createdPersonIds: string[] = [];

async function createPerson(name: string, type = "internal_engineer") {
  const res = await request(app)
    .post("/api/people")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name, type });
  createdPersonIds.push(res.body.id);
  return res.body;
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

  const otherProjectRes = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ client_id: clientId, name: `${PREFIX}OtherProject` });
  otherProjectId = otherProjectRes.body.id;
  createdProjectIds.push(otherProjectId);
});

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await pool.query(`DELETE FROM project_people WHERE project_id = ANY($1::uuid[])`, [createdProjectIds]);
    await pool.query(`DELETE FROM projects WHERE id = ANY($1::uuid[])`, [createdProjectIds]);
  }
  if (createdClientIds.length > 0) {
    await pool.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [createdClientIds]);
  }
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [memberUserId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [memberUserId]);
  await pool.end();
});

describe("project_people", () => {
  it("[12] adds a person to a project with a role (201)", async () => {
    const person = await createPerson(`${PREFIX}Assignee1`);

    const res = await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    expect(res.status).toBe(201);
    expect(res.body.role_in_project).toBe("engineer");
    expect(res.body.person.id).toBe(person.id);
  });

  it("[13] adding the SAME person/project/role again returns 409 CONFLICT", async () => {
    const person = await createPerson(`${PREFIX}Assignee2`);

    await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("[14] adding the same person/project with a DIFFERENT role succeeds (201, scoped uniqueness)", async () => {
    const person = await createPerson(`${PREFIX}Assignee3`);

    const firstRole = await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });
    expect(firstRole.status).toBe(201);

    const secondRole = await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "approver" });
    expect(secondRole.status).toBe(201);

    const listRes = await request(app)
      .get(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);
    const rolesForPerson = listRes.body
      .filter((entry: { person: { id: string } }) => entry.person.id === person.id)
      .map((entry: { role_in_project: string }) => entry.role_in_project);
    expect(rolesForPerson.sort()).toEqual(["approver", "engineer"]);
  });

  it("[15] removing a person from a project returns 200 and they disappear from the list", async () => {
    const person = await createPerson(`${PREFIX}Assignee4`);

    await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    const removeRes = await request(app)
      .delete(`/api/projects/${projectId}/people/${person.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(removeRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listRes.body.some((entry: { person: { id: string } }) => entry.person.id === person.id)).toBe(false);
  });

  it("[16] one person assigned to multiple projects shows up under each", async () => {
    const person = await createPerson(`${PREFIX}MultiProject`);

    await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });
    await request(app)
      .post(`/api/projects/${otherProjectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    const listA = await request(app)
      .get(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);
    const listB = await request(app)
      .get(`/api/projects/${otherProjectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(listA.body.some((entry: { person: { id: string } }) => entry.person.id === person.id)).toBe(true);
    expect(listB.body.some((entry: { person: { id: string } }) => entry.person.id === person.id)).toBe(true);
  });

  it("[17] a project with multiple people returns a complete, correctly-shaped list", async () => {
    const personA = await createPerson(`${PREFIX}Multi1`);
    const personB = await createPerson(`${PREFIX}Multi2`);
    const personC = await createPerson(`${PREFIX}Multi3`);

    for (const p of [personA, personB, personC]) {
      await request(app)
        .post(`/api/projects/${otherProjectId}/people`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ people_id: p.id, role_in_project: "engineer" });
    }

    const res = await request(app)
      .get(`/api/projects/${otherProjectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.map((entry: { person: { id: string } }) => entry.person.id);
    expect(ids).toEqual(expect.arrayContaining([personA.id, personB.id, personC.id]));
    for (const entry of res.body) {
      expect(entry).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          project_id: otherProjectId,
          role_in_project: expect.any(String),
          created_at: expect.any(String),
          person: expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            type: expect.any(String),
          }),
        })
      );
    }
  });

  it("[18] a soft-deleted assigned person still appears, with deleted_at visible (history preserved)", async () => {
    const person = await createPerson(`${PREFIX}SoftDeleteAssignee`);

    await request(app)
      .post(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ people_id: person.id, role_in_project: "engineer" });

    const deleteRes = await request(app)
      .delete(`/api/people/${person.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/projects/${projectId}/people`)
      .set("Authorization", `Bearer ${adminToken}`);

    const entry = listRes.body.find((e: { person: { id: string } }) => e.person.id === person.id);
    expect(entry).toBeDefined();
    expect(entry.person.deleted_at).not.toBeNull();
  });
});
