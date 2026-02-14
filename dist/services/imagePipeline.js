"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processProductImage = void 0;
const sharp_1 = __importDefault(require("sharp"));
const processProductImage = async (inputBuffer) => {
    const buffer = await (0, sharp_1.default)(inputBuffer)
        .resize({ width: 1080, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    return { buffer, contentType: "image/webp" };
};
exports.processProductImage = processProductImage;
//# sourceMappingURL=imagePipeline.js.map