# s3-hsts-transcoder

Self-hosted video transcoder. Watches an S3-compatible source bucket and produces HLS streaming output in a destination bucket. Designed to run on **AWS Lambda**, **Cloudflare Containers**, or any **local / VPS / AWS Lightsail** host on a cron schedule. No per-minute pricing.

> The directory name reflects an early naming mistake — the format produced is **HLS** (HTTP Live Streaming). HSTS is unrelated.

## Status

In planning / scaffolding. See **[PLAN.md](./PLAN.md)** for architecture and design decisions. **[FUTURE.md](./FUTURE.md)** lists deferred features.

## Structure

- [`lib/`](./lib) — shared transcoding logic (the real work)
- [`aws/`](./aws) — AWS Lambda entrypoint
- [`cloudflare/`](./cloudflare) — Cloudflare Containers entrypoint
- [`local/`](./local) — local / VPS / AWS Lightsail cron entrypoint

Each package has its own README with platform-specific setup. Configuration is via environment variables; see `.env.sample` in each entrypoint package.

## Toolchain

Node.js + TypeScript + pnpm workspaces. ffmpeg is required at runtime (vendored into Lambda/Container images, expected on PATH for local).

## Quick reference

| Want to                                        | Go to                                |
|------------------------------------------------|--------------------------------------|
| Understand the architecture                    | [PLAN.md](./PLAN.md)                 |
| See deferred features                          | [FUTURE.md](./FUTURE.md)             |
| Run the transcoder on Lambda                   | [aws/README.md](./aws/README.md)     |
| Run the transcoder on Cloudflare               | [cloudflare/README.md](./cloudflare/README.md) |
| Run the transcoder locally / on VPS / Lightsail| [local/README.md](./local/README.md) |
| Develop or test the shared lib                 | [lib/README.md](./lib/README.md)     |
