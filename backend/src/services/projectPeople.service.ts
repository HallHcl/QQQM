import { PoolClient } from "pg";
import { pool } from "../db/pool";
import { ProjectPeople } from "../types";

export async function listPeopleForProject(
  projectId: string
): Promise<ProjectPeople[]> {
  const result = await pool.query<ProjectPeople>(
    `SELECT * FROM project_people WHERE project_id = $1 ORDER BY created_at`,
    [projectId]
  );
  return result.rows;
}

export async function addPersonToProject(
  projectId: string,
  peopleId: string,
  roleInProject: string,
  client: PoolClient
): Promise<ProjectPeople> {
  const result = await client.query<ProjectPeople>(
    `INSERT INTO project_people (project_id, people_id, role_in_project)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [projectId, peopleId, roleInProject]
  );
  return result.rows[0];
}

export async function removePersonFromProject(
  projectId: string,
  peopleId: string,
  client: PoolClient
): Promise<ProjectPeople | null> {
  const result = await client.query<ProjectPeople>(
    `DELETE FROM project_people WHERE project_id = $1 AND people_id = $2 RETURNING *`,
    [projectId, peopleId]
  );
  return result.rows[0] ?? null;
}
