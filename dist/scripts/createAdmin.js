"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config();
const ADMIN_EMAIL = "director@codingai.in";
const ADMIN_PASSWORD = "AhrasAe@10";
const ADMIN_NAME = "Director";
async function main() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is not set in .env");
    }
    const db = new pg_1.Pool({ connectionString: databaseUrl });
    const { rows } = await db.query(`SELECT id, roles FROM users WHERE email = $1`, [ADMIN_EMAIL]);
    const passwordHash = await bcryptjs_1.default.hash(ADMIN_PASSWORD, 10);
    if (!rows[0]) {
        // eslint-disable-next-line no-console
        console.log("Creating new admin user...");
        await db.query(`INSERT INTO users (full_name, email, password_hash, role, roles, created_at)
       VALUES ($1, $2, $3, 'admin', ARRAY['admin']::text[], NOW())`, [ADMIN_NAME, ADMIN_EMAIL, passwordHash]);
    }
    else {
        // eslint-disable-next-line no-console
        console.log("Admin exists. Updating role & password...");
        await db.query(`UPDATE users
       SET
         password_hash = $2,
         role = 'admin',
         roles = CASE
           WHEN roles IS NULL THEN ARRAY['admin']::text[]
           WHEN roles @> ARRAY['admin']::text[] THEN roles
           ELSE array_append(roles, 'admin')
         END,
         updated_at = NOW()
       WHERE email = $1`, [ADMIN_EMAIL, passwordHash]);
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
//# sourceMappingURL=createAdmin.js.map