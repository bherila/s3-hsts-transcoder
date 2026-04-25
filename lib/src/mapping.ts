import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { isNotFound } from "./s3.js";

export interface SourceMapping {
  sourceKey: string;
  sourceEtag: string;
  sourceSize: number;
  sourceLastModified: string;
  contentId: string;
  hlsRoot: string;
  encodedAt: string;
  encoderVersion: string;
}

export function mappingKey(sourceKey: string): string {
  return `mappings/${sourceKey}.json`;
}

export async function readMapping(
  client: S3Client,
  bucket: string,
  sourceKey: string,
): Promise<SourceMapping | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: mappingKey(sourceKey) }),
    );
    if (!res.Body) throw new Error(`Empty body for ${mappingKey(sourceKey)}`);
    const text = await res.Body.transformToString();
    return JSON.parse(text) as SourceMapping;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function writeMapping(
  client: S3Client,
  bucket: string,
  mapping: SourceMapping,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: mappingKey(mapping.sourceKey),
      Body: JSON.stringify(mapping, null, 2),
      ContentType: "application/json",
    }),
  );
}

/**
 * Cheap "have we processed this exact source before?" check.
 * Source ETag + size match → skip. ETag is bucket-specific (multipart
 * uploads produce different ETags across tools), but stable for the *same*
 * upload, which is what we need here.
 */
export function isCachedMapping(
  mapping: SourceMapping | null,
  current: { etag: string; size: number },
): boolean {
  if (!mapping) return false;
  return mapping.sourceEtag === current.etag && mapping.sourceSize === current.size;
}
