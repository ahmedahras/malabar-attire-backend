import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db/pool";
import {
  createUser,
  findUserByEmail,
  signToken
} from "../services/authService";
import { keysToCamel } from "../utils/case";
import { env } from "../config/env";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
  role: z.enum(["customer", "admin"]).optional(),
  adminKey: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const register = async (req: Request, res: Response) => {
  const body = registerSchema.parse(req.body);

  const existing = await findUserByEmail(body.email);
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const role = body.role ?? "customer";
  if (role === "admin") {
    if (!env.ADMIN_REGISTER_KEY || body.adminKey !== env.ADMIN_REGISTER_KEY) {
      return res.status(403).json({ error: "Admin registration is disabled" });
    }
  }

  const user = await createUser({
    fullName: body.name,
    email: body.email,
    phone: body.phone,
    password: body.password,
    role
  });

  const token = signToken({ sub: user.id, role: user.role });
  const mappedUser = keysToCamel(user) as {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    role: string;
  };

  return res.status(201).json({
    token,
    user: {
      id: mappedUser.id,
      name: mappedUser.fullName,
      email: mappedUser.email,
      role: mappedUser.role
    }
  });
};

export const login = async (req: Request, res: Response) => {
  const body = loginSchema.parse(req.body);
  const user = await findUserByEmail(body.email);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(body.password, user.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const rawRoles: string[] = Array.isArray((user as any).roles) ? (user as any).roles : [];
  const effectiveRole =
    rawRoles.includes("admin") ? "admin" : rawRoles.includes("shop_owner") ? "shop_owner" : "customer";
  const token = signToken({ sub: user.id, role: effectiveRole });
  const mappedUser = keysToCamel(user) as {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    role: string;
  };

  return res.json({
    token,
    user: {
      id: mappedUser.id,
      name: mappedUser.fullName,
      email: mappedUser.email,
      role: effectiveRole
    }
  });
};
