import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { Pool } from "pg";
import { databaseEnvHint, resolveDatabaseUrlFromEnv } from "../config/databaseUrl";

dotenv.config({ override: false });

const ADMIN_EMAIL = "director@codingai.in";
const ADMIN_PASSWORD = "AhrasAe@10";
const ADMIN_NAME = "Director";

async function main() {
  const databaseUrl = resolveDatabaseUrlFromEnv();
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is not set. ${databaseEnvHint}`);
  }

  const db = new Pool({ connectionString: databaseUrl });

  const { rows } = await db.query<{ id: string; roles: string[] | null }>(
    `SELECT id, roles FROM users WHERE email = $1`,
    [ADMIN_EMAIL]
  );

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (!rows[0]) {
    // eslint-disable-next-line no-console
    console.log("Creating new admin user...");
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, roles, created_at)
       VALUES ($1, $2, $3, 'admin', ARRAY['admin']::text[], NOW())`,
      [ADMIN_NAME, ADMIN_EMAIL, passwordHash]
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("Admin exists. Updating role & password...");
    await db.query(
      `UPDATE users
       SET
         password_hash = $2,
         role = 'admin',
         roles = CASE
           WHEN roles IS NULL THEN ARRAY['admin']::text[]
           WHEN roles @> ARRAY['admin']::text[] THEN roles
           ELSE array_append(roles, 'admin')
         END,
         updated_at = NOW()
       WHERE email = $1`,
      [ADMIN_EMAIL, passwordHash]
    );
  }

  await db.end();
  // eslint-disable-next-line no-console
  console.log("Admin setup complete.");
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });

