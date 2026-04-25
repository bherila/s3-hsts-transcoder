import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Platform } from "./config.js";
import type { Logger } from "./logger.js";
import { isNotFound, isPreconditionFailed } from "./s3.js";

export const GLOBAL_LOCK_KEY = ".transcoder.lock";

export interface LockBody {
  workerId: string;
  platform: Platform;
  hostname: string;
  startedAt: string;
  expectedEndBy: string;
  lockTtlSeconds: number;
}

export interface LockHandle {
  workerId: string;
  release: () => Promise<void>;
}

export interface AcquireOptions {
  client: S3Client;
  bucket: string;
  key?: string;
  platform: Platform;
  maxRuntimeSeconds: number;
  lockTtlSeconds: number;
  logger: Logger;
}

/**
 * Atomic lock acquisition via S3 conditional PUT (`If-None-Match: *`).
 *
 * Returns:
 * - `LockHandle` on success.
 * - `null` if the lock is held by a live worker (caller should exit cleanly).
 *
 * Throws on transport / unexpected errors.
 */
export async function acquireLock(opts: AcquireOptions): Promise<LockHandle | null> {
  const key = opts.key ?? GLOBAL_LOCK_KEY;

  const handle = await tryPut(opts, key);
  if (handle) return handle;

  // Lock exists. Read it, check staleness.
  const existing = await readLock(opts.client, opts.bucket, key);
  if (existing === null) {
    // Race: lock disappeared between PUT and GET. Try once more.
    return tryPut(opts, key);
  }

  const ageSeconds = (Date.now() - new Date(existing.startedAt).getTime()) / 1000;
  if (ageSeconds < existing.lockTtlSeconds) {
    opts.logger.info("lock held by live worker; exiting", {
      key,
      heldBy: existing.workerId,
      ageSeconds: Math.round(ageSeconds),
      ttlSeconds: existing.lockTtlSeconds,
    });
    return null;
  }

  opts.logger.warn("stale lock found; attempting takeover", {
    key,
    staleWorkerId: existing.workerId,
    ageSeconds: Math.round(ageSeconds),
  });
  try {
    await opts.client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
  } catch (err) {
    opts.logger.warn("failed to delete stale lock; will retry PUT anyway", {
      key,
      error: String(err),
    });
  }
  return tryPut(opts, key);
}

async function tryPut(opts: AcquireOptions, key: string): Promise<LockHandle | null> {
  const workerId = randomUUID();
  const now = new Date();
  const body: LockBody = {
    workerId,
    platform: opts.platform,
    hostname: hostname(),
    startedAt: now.toISOString(),
    expectedEndBy: new Date(now.getTime() + opts.maxRuntimeSeconds * 1000).toISOString(),
    lockTtlSeconds: opts.lockTtlSeconds,
  };

  try {
    await opts.client.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: key,
        Body: JSON.stringify(body, null, 2),
        ContentType: "application/json",
        IfNoneMatch: "*",
      }),
    );
  } catch (err) {
    if (isPreconditionFailed(err)) return null;
    throw err;
  }

  opts.logger.info("acquired lock", { key, workerId });

  return {
    workerId,
    release: async () => {
      try {
        await opts.client.send(
          new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }),
        );
        opts.logger.info("released lock", { key, workerId });
      } catch (err) {
        opts.logger.warn("failed to release lock; will expire after TTL", {
          key,
          workerId,
          error: String(err),
        });
      }
    },
  };
}

async function readLock(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<LockBody | null> {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const text = await res.Body.transformToString();
    return JSON.parse(text) as LockBody;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Lock TTL = MAX_RUNTIME × multiplier. Keeps a worker's lock alive past its
 * platform-imposed kill so its successor doesn't fight a still-running peer,
 * while bounding the wait for crash recovery.
 */
export function computeLockTtlSeconds(
  maxRuntimeSeconds: number,
  multiplier: number,
): number {
  return Math.ceil(maxRuntimeSeconds * multiplier);
}

/**
 * Self-imposed budget = MAX_RUNTIME × multiplier. Workers stop starting new
 * videos once budget is exhausted, so they can release the lock cleanly
 * before the platform kills them.
 */
export function computeBudgetSeconds(
  maxRuntimeSeconds: number,
  multiplier: number,
): number {
  return Math.floor(maxRuntimeSeconds * multiplier);
}
