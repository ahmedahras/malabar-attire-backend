import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { db } from "../db/pool";
import { AuthPayload } from "../middleware/auth";

export type RegisterInput = {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: AuthPayload["role"];
};

export const createUser = async (input: RegisterInput) => {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (full_name, email, phone, password_hash, role, roles)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, full_name, email, phone, role, roles, created_at`,
    [input.fullName, input.email, input.phone ?? null, passwordHash, input.role, [input.role]]
  );

  const userId = rows[0]?.id as string | undefined;
  if (userId) {
    await db.query(
      `INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
  }

  return rows[0];
};

export const findUserByEmail = async (email: string) => {
  const { rows } = await db.query(
    `SELECT id, full_name, email, phone, password_hash, role, roles
     FROM users
     WHERE email = $1`,
    [email]
  );
  return rows[0];
};

export const signToken = (payload: AuthPayload) => {
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
};
