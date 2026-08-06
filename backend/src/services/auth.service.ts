import { pool } from "../db/pool";
import { User } from "../types";

export async function findUserByUsername(
  username: string
): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT * FROM users WHERE username = $1 AND deleted_at IS NULL`,
    [username]
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query<User>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findRoleNamesForUser(userId: string): Promise<string[]> {
  const result = await pool.query<{ name: string }>(
    `SELECT r.name
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 AND r.deleted_at IS NULL`,
    [userId]
  );
  return result.rows.map((r) => r.name);
}
