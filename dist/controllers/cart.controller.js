"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveCart = void 0;
const cart_service_1 = require("../services/cart.service");
const getActiveCart = async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: "Missing token" });
    }
    const cart = await (0, cart_service_1.getActiveCartForUser)(req.user.sub);
    return res.json(cart);
};
exports.getActiveCart = getActiveCart;
//# sourceMappingURL=cart.controller.js.map