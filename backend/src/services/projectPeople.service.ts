import { pool } from "../db/pool";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { AddProjectPersonInput } from "../validators/projectPeople.validator";

const UNIQUE_VIOLATION = "23505";

export interface ProjectPersonEntry {
  id: string;
  project_id: string;
  role_in_project: string;
  created_at: string;
  person: {
    id: string;
    name: string;
    email: string | null;
    type: string;
    deleted_at: string | null;
  };
}

/**
 * Includes soft-deleted people (marked via their `deleted_at`) rather than
 * hiding them — a project's people list is historical record, and erasing a
 * soft-deleted assignee would lose legitimate history of who worked on it.
 */
export async function listProjectPeople(projectId: string): Promise<ProjectPersonEntry[]> {
  const result = await pool.query(
    `SELECT pp.id, pp.project_id, pp.role_in_project, pp.created_at,
            p.id AS person_id, p.name AS person_name, p.email AS person_email,
            p.type AS person_type, p.deleted_at AS person_deleted_at
     FROM project_people pp
     JOIN people p ON p.id = pp.people_id
     WHERE pp.project_id = $1
     ORDER BY p.name`,
    [projectId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    project_id: row.project_id,
    role_in_project: row.role_in_project,
    created_at: row.created_at,
    person: {
      id: row.person_id,
      name: row.person_name,
      email: row.person_email,
      type: row.person_type,
      deleted_at: row.person_deleted_at,
    },
  }));
}

export async function addProjectPerson(
  projectId: string,
  input: AddProjectPersonInput,
  actingPeopleId: string
): Promise<ProjectPersonEntry> {
  return withTransaction(async (tx) => {
    const personCheck = await tx.query<{ id: string; name: string; email: string | null; type: string }>(
      `SELECT id, name, email, type FROM people WHERE id = $1 AND deleted_at IS NULL`,
      [input.people_id]
    );
    if (personCheck.rows.length === 0) {
      throw new ApiError(
        400,
        "people_id does not reference an existing, active person",
        "VALIDATION_ERROR",
        { field: "people_id" }
      );
    }
    const person = personCheck.rows[0];

    try {
      const result = await tx.query(
        `INSERT INTO project_people (project_id, people_id, role_in_project)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [projectId, input.people_id, input.role_in_project]
      );
      const created = result.rows[0];
      await logActivity("project", projectId, "update", actingPeopleId, null, created, tx);

      return {
        id: created.id,
        project_id: created.project_id,
        role_in_project: created.role_in_project,
        created_at: created.created_at,
        person: { id: person.id, name: person.name, email: person.email, type: person.type, deleted_at: null },
      };
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ApiError(
          409,
          "This person already has this role on this project",
          "CONFLICT"
        );
      }
      throw err;
    }
  });
}

export async function removeProjectPerson(
  projectId: string,
  peopleId: string,
  actingPeopleId: string
): Promise<void> {
  return withTransaction(async (tx) => {
    const result = await tx.query(
      `DELETE FROM project_people WHERE project_id = $1 AND people_id = $2 RETURNING *`,
      [projectId, peopleId]
    );
    if (result.rows.length === 0) {
      throw new ApiError(404, "Project/person relationship not found");
    }
    await logActivity("project", projectId, "update", actingPeopleId, result.rows, null, tx);
  });
}
