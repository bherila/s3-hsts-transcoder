# Add MinIO integration test

## Summary

Add a docker-compose-based integration test harness that validates the full transcoding pipeline against real S3-compatible bucket I/O (via MinIO), not mocked clients.

## Motivation

- Unit tests (53 passing) exercise mocked S3 interactions and pure functions. They don't catch whole classes of bugs: bucket layout mismatches, concurrent-lock race conditions, fingerprint index correctness, or repoint-on-quality-upgrade atomicity.
- An end-to-end run would verify [SPEC.md](../../SPEC.md) contract enforcement.
- Zero real invocations to date — highest-value unverified risk.

## Approach

1. **docker-compose.test.yml** — MinIO container + optional postgres/sqlite for Durable Object state (forward-compat for CF integration test).
   - MinIO admin console disabled or in-band auth.
   - Spin up / tear down in test setup/cleanup via testcontainers or similar.

2. **Test fixture** — 2–3 small video files (10–30 MB total, short duration, varying resolutions to exercise ABR ladder filtering). Store under `lib/test-fixtures/`.

3. **Integration test** (`lib/src/integration.test.ts`):
   - Create source and dest buckets in MinIO.
   - Upload fixture videos.
   - Call `runOnce({config, logger})` pointing at MinIO endpoint + buckets.
   - Assert on dest bucket structure:
     - `by-id/sha256:<hash>/master.m3u8` exists with correct segment layout.
     - `mappings/<source-path>.json` entries point correctly to contentId.
     - `fingerprints/index.json` lists all processed videos with frame counts.
   - Verify **byte-hash dedup**: upload the same video twice, assert second run creates only one mapping (reuse existing).
   - Verify **perceptual dedup**: upload two perceptually similar videos, assert they share one `by-id/` entry.
   - Verify **repoint-on-upgrade**: upload low-res, then high-res with perceptual match ≥ PERCEPTUAL_THRESHOLD, assert:
     - Old `by-id/<oldId>/` is deleted.
     - Old `fingerprints/<oldId>.bin` is deleted.
     - All mappings that pointed at oldId now point at newId.
   - (Optional) **cleanup pass**: delete a source file, run cleanup with `CLEANUP_DELETED_SOURCES=true`, assert:
     - Orphan mappings deleted.
     - Refcounted `by-id/` entries retained (if other live sources point at them).
     - Index cleaned up.

## Acceptance

- Test runs in CI (GitHub Actions) via `pnpm test` alongside unit tests.
- Passes with the current codebase.
- Documents expected dest-bucket state in assertions — acts as executable [SPEC.md](../../SPEC.md).
- Either uses testcontainers or a pre-built MinIO Docker image for portability.

## Notes

- Fixture videos can be synthetic (ffmpeg-generated in CI, or pre-committed small test.mp4 files).
- If ffmpeg is unavailable in the test environment, pre-generate fixtures or skip this test in CI and make it opt-in locally (`pnpm --filter @s3-hsts-transcoder/lib test -- --grep integration` or similar).
- MinIO should run in standalone mode and listen on a random local port (no port conflicts in CI).
- Consider using a test helper like `aws-sdk-client-mock` pattern but for bucket I/O: wrap MinIO setup/teardown in a beforeAll/afterAll hook.

## Related

- [#6 (completed)](../../../issues/6) aws-sdk-client-mock tests. This is the next tier of test coverage.
- [SPEC.md](../../SPEC.md) — the contract being tested.
