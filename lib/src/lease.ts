import type { S3Client } from "@aws-sdk/client-s3";
import type { Platform } from "./config.js";
import type { Logger } from "./logger.js";
import { acquireLock, type LockHandle } from "./lock.js";

export function leaseKey(contentId: string): string {
  return `by-id/${contentId}/.processing`;
}

export interface AcquireLeaseOptions {
  client: S3Client;
  bucket: string;
  contentId: string;
  platform: Platform;
  maxRuntimeSeconds: number;
  lockTtlSeconds: number;
  logger: Logger;
}

/**
 * Per-video lease. Same atomic conditional-PUT primitive as the global lock,
 * keyed by content ID. Redundant under v1's single-runner global lock, but
 * it makes raising MAX_CONCURRENCY a one-line change later.
 */
export async function acquireLease(opts: AcquireLeaseOptions): Promise<LockHandle | null> {
  return acquireLock({
    client: opts.client,
    bucket: opts.bucket,
    key: leaseKey(opts.contentId),
    platform: opts.platform,
    maxRuntimeSeconds: opts.maxRuntimeSeconds,
    lockTtlSeconds: opts.lockTtlSeconds,
    logger: opts.logger,
  });
}
