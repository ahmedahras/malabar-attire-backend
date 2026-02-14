"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateKidsCategorySelection = void 0;
const pool_1 = require("../db/pool");
const STYLE_WORDS = ["ethnic", "western", "party"];
const hasStyleWord = (name) => {
    const lower = name.toLowerCase();
    return STYLE_WORDS.some((w) => lower.includes(w));
};
const isKidsAgeCategoryName = (name) => {
    const n = name.toLowerCase();
    return (/\b(0|0\s*[-–]\s*2)\b/.test(n) ||
        /\b3\s*[-–]\s*5\b/.test(n) ||
        /\b6\s*[-–]\s*9\b/.test(n) ||
        /\b10\s*[-–]\s*14\b/.test(n));
};
const validateKidsCategorySelection = async (req, res, next) => {
    const rawIds = (req.body?.categoryIds ?? null);
    if (!rawIds)
        return next();
    if (!Array.isArray(rawIds) || rawIds.length === 0)
        return next();
    const categoryIds = rawIds.map(String);
    const { rows } = await pool_1.db.query(`SELECT id, name, gender
     FROM product_categories
     WHERE id = ANY($1::uuid[])`, [categoryIds]);
    for (const row of rows) {
        if (row.gender === "KIDS") {
            const name = String(row.name ?? "");
            if (hasStyleWord(name)) {
                return res.status(400).json({ error: "Kids categories must be age-based only" });
            }
            // stricter: must match age pattern
            if (!isKidsAgeCategoryName(name)) {
                return res.status(400).json({ error: "Kids categories must be age-based only" });
            }
        }
    }
    return next();
};
exports.validateKidsCategorySelection = validateKidsCategorySelection;
//# sourceMappingURL=categoryValidation.js.map