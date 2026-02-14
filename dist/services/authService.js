"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = exports.findUserByEmail = exports.createUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const pool_1 = require("../db/pool");
const createUser = async (input) => {
    const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
    const { rows } = await pool_1.db.query(`INSERT INTO users (full_name, email, phone, password_hash, role, roles)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, full_name, email, phone, role, roles, created_at`, [input.fullName, input.email, input.phone ?? null, passwordHash, input.role, [input.role]]);
    const userId = rows[0]?.id;
    if (userId) {
        await pool_1.db.query(`INSERT INTO notification_preferences (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`, [userId]);
    }
    return rows[0];
};
exports.createUser = createUser;
const findUserByEmail = async (email) => {
    const { rows } = await pool_1.db.query(`SELECT id, full_name, email, phone, password_hash, role, roles
     FROM users
     WHERE email = $1`, [email]);
    return rows[0];
};
exports.findUserByEmail = findUserByEmail;
const signToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, {
        expiresIn: env_1.env.JWT_EXPIRES_IN
    });
};
exports.signToken = signToken;
//# sourceMappingURL=authService.js.map