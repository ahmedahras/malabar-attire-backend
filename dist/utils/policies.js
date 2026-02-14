"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canIssueRefund = exports.canModifyReturn = exports.canAccessOrder = void 0;
const canAccessOrder = (user, order) => {
    if (user.role === "admin") {
        return true;
    }
    if (user.role === "customer") {
        return order.userId === user.id;
    }
    if (user.role === "shop_owner") {
        return order.sellerId === user.id;
    }
    return false;
};
exports.canAccessOrder = canAccessOrder;
const canModifyReturn = (user, request) => {
    if (user.role === "admin") {
        return true;
    }
    if (user.role === "customer") {
        return request.userId === user.id;
    }
    if (user.role === "shop_owner") {
        return request.sellerId === user.id;
    }
    return false;
};
exports.canModifyReturn = canModifyReturn;
const canIssueRefund = (user, source) => {
    if (source === "return") {
        return user.role === "admin";
    }
    return false;
};
exports.canIssueRefund = canIssueRefund;
//# sourceMappingURL=policies.js.map