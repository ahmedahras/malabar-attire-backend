"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keysToCamel = void 0;
const toCamelCase = (value) => {
    return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};
const keysToCamel = (input) => {
    if (Array.isArray(input)) {
        return input.map((item) => (0, exports.keysToCamel)(item));
    }
    if (input !== null && typeof input === "object") {
        const result = {};
        for (const [key, value] of Object.entries(input)) {
            result[toCamelCase(key)] = (0, exports.keysToCamel)(value);
        }
        return result;
    }
    return input;
};
exports.keysToCamel = keysToCamel;
//# sourceMappingURL=case.js.map