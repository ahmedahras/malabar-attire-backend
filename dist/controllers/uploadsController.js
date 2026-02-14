"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUploadPresign = void 0;
const zod_1 = require("zod");
const crypto_1 = require("crypto");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const env_1 = require("../config/env");
const presignSchema = zod_1.z.object({
    filename: zod_1.z.string().min(1),
    contentType: zod_1.z.string().min(1)
});
const getS3Client = () => {
    if (!env_1.env.S3_BUCKET || !env_1.env.S3_REGION || !env_1.env.S3_ACCESS_KEY_ID || !env_1.env.S3_SECRET_ACCESS_KEY) {
        throw new Error("S3 credentials not configured");
    }
    return new client_s3_1.S3Client({
        region: env_1.env.S3_REGION,
        credentials: {
            accessKeyId: env_1.env.S3_ACCESS_KEY_ID,
            secretAccessKey: env_1.env.S3_SECRET_ACCESS_KEY
        }
    });
};
const buildPublicUrl = (key) => {
    if (env_1.env.CDN_BASE_URL) {
        return `${env_1.env.CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
    }
    return `https://${env_1.env.S3_BUCKET}.s3.${env_1.env.S3_REGION}.amazonaws.com/${key}`;
};
const createUploadPresign = async (req, res) => {
    const body = presignSchema.parse(req.body);
    const safeName = body.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const key = `products/${(0, crypto_1.randomUUID)()}-${safeName}`;
    const s3 = getS3Client();
    const command = new client_s3_1.PutObjectCommand({
        Bucket: env_1.env.S3_BUCKET,
        Key: key,
        ContentType: body.contentType,
        ACL: "public-read"
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 60 * 5 });
    const publicUrl = buildPublicUrl(key);
    return res.json({ uploadUrl, publicUrl, key });
};
exports.createUploadPresign = createUploadPresign;
//# sourceMappingURL=uploadsController.js.map