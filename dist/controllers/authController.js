"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const authService_1 = require("../services/authService");
const case_1 = require("../utils/case");
const env_1 = require("../config/env");
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    phone: zod_1.z.string().min(6).optional(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(["customer", "admin"]).optional(),
    adminKey: zod_1.z.string().min(1).optional()
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
const register = async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await (0, authService_1.findUserByEmail)(body.email);
    if (existing) {
        return res.status(409).json({ error: "Email already in use" });
    }
    const role = body.role ?? "customer";
    if (role === "admin") {
        if (!env_1.env.ADMIN_REGISTER_KEY || body.adminKey !== env_1.env.ADMIN_REGISTER_KEY) {
            return res.status(403).json({ error: "Admin registration is disabled" });
        }
    }
    const user = await (0, authService_1.createUser)({
        fullName: body.name,
        email: body.email,
        phone: body.phone,
        password: body.password,
        role
    });
    const token = (0, authService_1.signToken)({ sub: user.id, role: user.role });
    const mappedUser = (0, case_1.keysToCamel)(user);
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
exports.register = register;
const login = async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await (0, authService_1.findUserByEmail)(body.email);
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const isValid = await bcryptjs_1.default.compare(body.password, user.password_hash);
    if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const rawRoles = Array.isArray(user.roles) ? user.roles : [];
    const effectiveRole = rawRoles.includes("admin") ? "admin" : rawRoles.includes("shop_owner") ? "shop_owner" : "customer";
    const token = (0, authService_1.signToken)({ sub: user.id, role: effectiveRole });
    const mappedUser = (0, case_1.keysToCamel)(user);
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
exports.login = login;
//# sourceMappingURL=authController.js.map