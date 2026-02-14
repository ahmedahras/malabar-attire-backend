"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireShopContext = exports.requireRole = exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const pool_1 = require("../db/pool");
const requireAuth = (req, res, next) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
        return res.status(401).json({ error: "Missing token" });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
        req.user = payload;
        return next();
    }
    catch (error) {
        return res.status(401).json({ error: "Invalid token" });
    }
};
exports.requireAuth = requireAuth;
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Missing token" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Forbidden" });
        }
        return next();
    };
};
exports.requireRole = requireRole;
const requireShopContext = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const shopIdHeader = req.headers["x-shop-id"];
    const shopId = Array.isArray(shopIdHeader) ? shopIdHeader[0] : shopIdHeader;
    if (!shopId || typeof shopId !== "string") {
        return res.status(400).json({ error: "Missing shop context" });
    }
    try {
        const { rows } = await pool_1.db.query(`SELECT id FROM shops WHERE id = $1 AND owner_user_id = $2`, [shopId, req.user.sub]);
        if (!rows[0]) {
            return res.status(403).json({ error: "Invalid shop ownership" });
        }
        req.shopId = shopId;
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.requireShopContext = requireShopContext;
//# sourceMappingURL=auth.js.map