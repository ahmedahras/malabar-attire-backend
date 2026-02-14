import { Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1)
});

const getS3Client = () => {
  if (!env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 credentials not configured");
  }
  return new S3Client({
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY
    }
  });
};

const buildPublicUrl = (key: string) => {
  if (env.CDN_BASE_URL) {
    return `${env.CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com/${key}`;
};

export const createUploadPresign = async (req: Request, res: Response) => {
  const body = presignSchema.parse(req.body);

  const safeName = body.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const key = `products/${randomUUID()}-${safeName}`;

  const s3 = getS3Client();
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: body.contentType,
    ACL: "public-read"
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
  const publicUrl = buildPublicUrl(key);

  return res.json({ uploadUrl, publicUrl, key });
};
