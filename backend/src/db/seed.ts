import bcrypt from "bcrypt";
import { pool } from "./pool";

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rolesResult = await client.query<{ id: string; name: string }>(
      `INSERT INTO roles (name, description)
       VALUES ('admin', 'Full system access'), ('member', 'Standard team member access')
       RETURNING id, name`
    );
    const adminRoleId = rolesResult.rows.find((r) => r.name === "admin")!.id;

    const clientResult = await client.query<{ id: string }>(
      `INSERT INTO clients (name, status, description)
       VALUES ('Acme Corporation', 'active', 'Sample seed client')
       RETURNING id`
    );
    const clientId = clientResult.rows[0].id;

    const personResult = await client.query<{ id: string }>(
      `INSERT INTO people (name, email, type)
       VALUES ('Alex Engineer', 'alex.engineer@example.com', 'internal_engineer')
       RETURNING id`
    );
    const personId = personResult.rows[0].id;

    const passwordHash = await bcrypt.hash("admin123", 10);

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (people_id, username, email, password_hash)
       VALUES ($1, 'admin', 'admin@example.com', $2)
       RETURNING id`,
      [personId, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, adminRoleId]
    );

    await client.query("COMMIT");
    console.log("Seed data inserted successfully.");
    console.log(`  Client:   Acme Corporation (${clientId})`);
    console.log(`  Person:   Alex Engineer (${personId})`);
    console.log(`  User:     admin (${userId}) / password: admin123`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
