"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const razorpay_1 = __importDefault(require("razorpay"));
const router = express_1.default.Router();
const razorpay = new razorpay_1.default({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
router.post("/create-order", async (req, res) => {
    try {
        const { amount } = req.body;
        const order = await razorpay.orders.create({
            amount: amount * 100,
            currency: "INR",
            receipt: "receipt_" + Date.now(),
        });
        res.json(order);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: "Order creation failed" });
    }
});
exports.default = router;
//# sourceMappingURL=payment.js.map