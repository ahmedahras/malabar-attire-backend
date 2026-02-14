"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePagination = void 0;
const parsePagination = (input) => {
    const defaultLimit = input.defaultLimit ?? 20;
    const maxLimit = input.maxLimit ?? 100;
    const parsedPage = Number(input.page ?? 1);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const parsedLimit = Number(input.limit ?? defaultLimit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : defaultLimit;
    const limit = Math.min(safeLimit, maxLimit);
    return {
        page,
        limit,
        offset: (page - 1) * limit
    };
};
exports.parsePagination = parsePagination;
//# sourceMappingURL=pagination.js.map