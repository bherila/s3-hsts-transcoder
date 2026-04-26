# Integration Tests

End-to-end tests for the HLS transcoder. These tests spin up a real MinIO
container via [Testcontainers](https://testcontainers.com/guides/getting-started-with-testcontainers-for-nodejs/),
generate a tiny MP4 fixture with `ffmpeg`, upload it to MinIO, call `runOnce()`,
and assert the expected S3 objects exist.

## Prerequisites

| Requirement                                                 | Notes                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Docker (or compatible runtime)                              | Testcontainers pulls and starts `minio/minio:latest`           |
| `ffmpeg` with `libx264`                                     | Must be on `PATH`, or set `FFMPEG_PATH`                        |
| `ffprobe`                                                   | Usually ships alongside `ffmpeg`; set `FFPROBE_PATH` if needed |
| `pnpm install` run at repo root                             | Fetches `testcontainers` and workspace deps                    |
| `lib` built (`pnpm --filter @s3-hsts-transcoder/lib build`) | Integration package imports from `lib/dist`                    |

## Running

```sh
# From the repo root:
INTEGRATION=1 pnpm --filter @s3-hsts-transcoder/integration test

# Or from inside integration/:
INTEGRATION=1 pnpm test
```

Without `INTEGRATION=1` the suite is skipped and exits cleanly. This means
`pnpm -r test` (run from the root) will skip these tests automatically, so
the standard CI pipeline that lacks Docker is unaffected.

## What the tests assert

1. `runOnce()` returns `{ processed: 1, failed: 0 }` for a fresh source video.
2. `by-id/sha256:<hash>/master.m3u8` exists and contains a valid HLS master
   playlist header (`#EXTM3U`, `#EXT-X-STREAM-INF`).
3. `mappings/videos/test.mp4.json` exists and contains the correct `sourceKey`,
   a `contentId` with scheme prefix `sha256:`, and an `hlsRoot` pointing at
   `master.m3u8`.
4. `.transcoder.lock` is absent after the run completes (lock was released).
5. A second `runOnce()` call with the same source returns `{ cached: 1 }`.
6. The `hlsRoot` in the mapping matches `masterPlaylistKey(contentId)` and the
   object actually exists in the destination bucket.
7. Per-variant playlists (`index.m3u8`) and at least one fMP4 segment (`.m4s`)
   are present under `by-id/`.
8. A fingerprint file and fingerprint index entry are written under
   `fingerprints/`.
9. `by-id/<contentId>/metadata.json` exists and contains `contentId`,
   `encoderVersion`, and `source.width`.

## Configuration

| Env var        | Default       | Purpose                          |
| -------------- | ------------- | -------------------------------- |
| `INTEGRATION`  | —             | Set to `1` to enable the suite   |
| `FFMPEG_PATH`  | (PATH lookup) | Override ffmpeg binary location  |
| `FFPROBE_PATH` | (PATH lookup) | Override ffprobe binary location |

MinIO is started on a random ephemeral port. Access credentials used inside
tests: `minioadmin` / `minioadmin` (MinIO's default).

## Timeout notes

Each test has a generous per-test timeout (up to 4 minutes) because transcode
time dominates. The `beforeAll` hook has a 2-minute timeout for container pull
and startup on the first run; subsequent runs use the cached image and are much
faster.
