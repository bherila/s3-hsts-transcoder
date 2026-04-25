import { S3Client } from "@aws-sdk/client-s3";
import type { BucketConfig } from "./config.js";

export function createS3Client(cfg: BucketConfig): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // Path-style works against R2, MinIO, and AWS S3. Virtual-hosted-style is
    // bucket-specific and would need DNS for non-AWS endpoints.
    forcePathStyle: true,
  });
}

export function isPreconditionFailed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("name" in err && err.name === "PreconditionFailed") return true;
  const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode === 412;
}

export function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("name" in err && (err.name === "NoSuchKey" || err.name === "NotFound")) {
    return true;
  }
  const meta = (err as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode === 404;
}
