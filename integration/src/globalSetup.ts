/**
 * Vitest globalSetup — runs once before the worker pool is created.
 *
 * Responsibilities:
 *  1. Gate the entire suite on INTEGRATION=1.
 *  2. Generate a tiny test MP4 fixture using ffmpeg so every test can reuse it
 *     without spending transcode time generating it themselves.
 *
 * The fixture path is communicated to tests via the FIXTURE_MP4 env var, which
 * Vitest makes available inside test workers automatically.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Module-level reference so teardown can remove the temp dir.
let fixtureTmpDir: string | undefined;

export async function setup(): Promise<void> {
  if (process.env["INTEGRATION"] !== "1") {
    // Skip loudly rather than silently so CI misconfiguration is obvious.
    console.log(
      "\n[integration] INTEGRATION env var is not set to 1 — skipping all integration tests.\n" +
        "  Run with: INTEGRATION=1 pnpm --filter @s3-hsts-transcoder/integration test\n",
    );
    // Returning early means no test files are set up; Vitest will find zero
    // test files from globalSetup's perspective, but the suite files will
    // themselves skip via a top-level `if` guard as a belt-and-suspenders.
    return;
  }

  // Locate ffmpeg (respect FFMPEG_PATH override, matching lib/src/ffmpeg/binary.ts).
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";

  // Create a stable temp directory for the fixture MP4.
  fixtureTmpDir = await mkdtemp(path.join(tmpdir(), "hls-integration-fixture-"));
  const fixturePath = path.join(fixtureTmpDir, "test.mp4");

  // Generate a 5-second, 320x240 video with a solid colour and a silent audio
  // stream. This is the smallest valid MP4 that exercises the full transcode
  // pipeline (probe → fingerprint → transcode → upload).
  //
  // Using lavfi sources avoids any file dependency:
  //   - color=c=blue:s=320x240:r=25  — 320×240 blue video at 25 fps
  //   - anullsrc=r=44100:cl=stereo   — silent stereo audio
  await execFileAsync(ffmpeg, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x240:r=25",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    "5",
    "-c:v",
    "libx264",
    "-profile:v",
    "main",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-shortest",
    fixturePath,
  ]);

  // Expose the fixture path to test workers via env.
  process.env["FIXTURE_MP4"] = fixturePath;
  console.log(`[integration] generated fixture MP4: ${fixturePath}`);
}

export async function teardown(): Promise<void> {
  if (fixtureTmpDir) {
    await rm(fixtureTmpDir, { recursive: true, force: true });
  }
}
