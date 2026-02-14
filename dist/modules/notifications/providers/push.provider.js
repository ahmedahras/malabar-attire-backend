"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const sendPushNotification = async (input) => {
    if (!input.token) {
        throw new Error("Missing push token");
    }
    // Stubbed provider for now.
    return { reference: `push:${Date.now()}` };
};
exports.sendPushNotification = sendPushNotification;
//# sourceMappingURL=push.provider.js.map