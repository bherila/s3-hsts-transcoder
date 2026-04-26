import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { Readable } from "node:stream";
import { sdkStreamMixin } from "@smithy/util-stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireLock, GLOBAL_LOCK_KEY, type LockBody } from "./lock.js";
import type { Logger } from "./logger.js";

const s3Mock = mockClient(S3Client);

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function bodyStream(payload: string) {
  return sdkStreamMixin(Readable.from([Buffer.from(payload)]));
}

function preconditionFailed(): S3ServiceException {
  const err = new S3ServiceException({
    name: "PreconditionFailed",
    $fault: "client",
    $metadata: { httpStatusCode: 412 },
    message: "Precondition Failed",
  });
  return err;
}

function notFound(): S3ServiceException {
  const err = new S3ServiceException({
    name: "NoSuchKey",
    $fault: "client",
    $metadata: { httpStatusCode: 404 },
    message: "Not Found",
  });
  return err;
}

beforeEach(() => {
  s3Mock.reset();
});

afterEach(() => {
  s3Mock.reset();
});

describe("acquireLock", () => {
  const baseOpts = {
    bucket: "dest",
    platform: "local" as const,
    maxRuntimeSeconds: 3600,
    lockTtlSeconds: 5400,
    logger: silentLogger,
  };

  it("acquires when no lock exists", async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const handle = await acquireLock({
      ...baseOpts,
      client: new S3Client({}),
    });

    expect(handle).not.toBeNull();
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args[0].input.Bucket).toBe("dest");
    expect(calls[0]!.args[0].input.Key).toBe(GLOBAL_LOCK_KEY);
    expect(calls[0]!.args[0].input.IfNoneMatch).toBe("*");
  });

  it("returns null when a live lock is held", async () => {
    s3Mock.on(PutObjectCommand).rejects(preconditionFailed());

    const liveLock: LockBody = {
      workerId: "other-worker",
      platform: "local",
      hostname: "host",
      startedAt: new Date().toISOString(),
      expectedEndBy: new Date(Date.now() + 3600_000).toISOString(),
      lockTtlSeconds: 5400,
    };
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyStream(JSON.stringify(liveLock)) });

    const handle = await acquireLock({
      ...baseOpts,
      client: new S3Client({}),
    });

    expect(handle).toBeNull();
  });

  it("takes over a stale lock", async () => {
    s3Mock.on(PutObjectCommand).rejectsOnce(preconditionFailed()).resolves({});

    const staleLock: LockBody = {
      workerId: "dead-worker",
      platform: "local",
      hostname: "host",
      startedAt: new Date(Date.now() - 10 * 3600_000).toISOString(),
      expectedEndBy: new Date(Date.now() - 9 * 3600_000).toISOString(),
      lockTtlSeconds: 5400,
    };
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyStream(JSON.stringify(staleLock)) });
    s3Mock.on(DeleteObjectCommand).resolves({});

    const handle = await acquireLock({
      ...baseOpts,
      client: new S3Client({}),
    });

    expect(handle).not.toBeNull();
    expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
  });

  it("retries PUT once if the lock disappears between PUT and GET", async () => {
    s3Mock.on(PutObjectCommand).rejectsOnce(preconditionFailed()).resolves({});
    s3Mock.on(GetObjectCommand).rejects(notFound());

    const handle = await acquireLock({
      ...baseOpts,
      client: new S3Client({}),
    });

    expect(handle).not.toBeNull();
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(2);
  });

  it("release() deletes the lock object", async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    const handle = await acquireLock({
      ...baseOpts,
      client: new S3Client({}),
    });

    expect(handle).not.toBeNull();
    await handle!.release();

    const deletes = s3Mock.commandCalls(DeleteObjectCommand);
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.args[0].input.Key).toBe(GLOBAL_LOCK_KEY);
  });
});
