import { Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1)
});

const signReadSchema = z.object({
  key: z.string().min(1)
});

const getS3Client = (): S3Client => {
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

// For private buckets we store the S3 key (not a public URL).
// CDN_BASE_URL can override for a CloudFront distribution in front of the private bucket.
const buildStoredValue = (key: string): string => {
  if (env.CDN_BASE_URL) {
    // CloudFront signed URLs or public CDN — return full URL
    return `${env.CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  // Store just the key so we can generate signed GET URLs on demand
  return key;
};

// POST /api/uploads/presign
// Returns a presigned PUT URL for the frontend to upload directly to S3,
// plus the key (or CDN URL) to store in the DB.
export const createUploadPresign = async (req: Request, res: Response) => {
  const body = presignSchema.parse(req.body);

  const safeName = body.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const key = `products/${randomUUID()}-${safeName}`;

  const s3 = getS3Client();

  // No ACL — works with both Block Public Access enabled and disabled
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key,
    ContentType: body.contentType
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 }); // 5 min to upload
  const storedValue = buildStoredValue(key);

  return res.json({
    uploadUrl,  // PUT this URL with the file bytes
    publicUrl: storedValue, // save this as the image reference in DB
    key
  });
};

// POST /api/uploads/sign-read
// Given a stored S3 key, returns a short-lived signed GET URL for displaying the image.
// Use this whenever you need to render a private-bucket image in the browser.
export const createReadPresign = async (req: Request, res: Response) => {
  const body = signReadSchema.parse(req.body);

  // If it's already a full https URL (CDN or legacy public URL), return it directly
  if (body.key.startsWith("https://") || body.key.startsWith("http://")) {
    return res.json({ url: body.key, expiresIn: null });
  }

  const s3 = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: body.key
  });

  // 1 hour signed URL — enough for a browsing session
  const url = await getSignedUrl(s3, command, { expiresIn: 60 * 60 });

  return res.json({ url, expiresIn: 3600 });
};

// GET /api/uploads/product-image?key=products/uuid-file.jpg
// Public endpoint (no auth) — redirects to a signed S3 GET URL.
// Only serves keys under the products/ prefix to prevent arbitrary key enumeration.
export const serveProductImage = async (req: Request, res: Response) => {
  const key = typeof req.query.key === "string" ? req.query.key : null;

  if (!key || !key.startsWith("products/")) {
    return res.status(400).json({ error: "Invalid key" });
  }

  // If CDN is configured, redirect directly to CDN URL (no signing needed)
  if (env.CDN_BASE_URL) {
    return res.redirect(302, `${env.CDN_BASE_URL.replace(/\/$/, "")}/${key}`);
  }

  const s3 = getS3Client();

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET!,
    Key: key
  });

  // 15-minute signed URL — short since the browser will cache the redirected image
  const url = await getSignedUrl(s3, command, { expiresIn: 60 * 15 });

  // Cache the redirect briefly so repeated renders don't hammer this endpoint
  res.setHeader("Cache-Control", "private, max-age=600");
  return res.redirect(302, url);
};
