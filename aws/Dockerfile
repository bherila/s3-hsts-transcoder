# syntax=docker/dockerfile:1
#
# AWS Lambda container image for the @s3-hsts-transcoder/aws entrypoint.
#
# Build from the repo root:
#   docker build -f aws/Dockerfile -t s3-hsts-transcoder-aws .
#
# Multi-arch (linux/amd64 + linux/arm64 Graviton):
#   docker buildx build -f aws/Dockerfile --platform linux/amd64,linux/arm64 \
#       -t <ecr-registry>/s3-hsts-transcoder-aws:latest --push .
#
# Lambda config: timeout 900s, memory 3008–10240 MB. Handler is the default
# from CMD: `dist/index.handler`.

ARG NODE_VERSION=22

# ----- Build stage --------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS builder

RUN apk add --no-cache build-base python3 git \
 && npm install -g pnpm@10

WORKDIR /workspace
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY lib ./lib
COPY aws ./aws

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @s3-hsts-transcoder/lib --filter @s3-hsts-transcoder/aws -r build
RUN pnpm --filter @s3-hsts-transcoder/aws deploy --prod /deploy

# ----- Runtime stage ------------------------------------------------------
FROM public.ecr.aws/lambda/nodejs:${NODE_VERSION}

# Static ffmpeg + ffprobe. johnvansickle.com is the conventional source for
# Lambda-friendly Linux static builds; pin a version here for reproducible
# builds when this stabilizes.
ARG TARGETARCH=amd64
RUN set -eux \
 && dnf install -y --setopt=tsflags=nodocs tar xz \
 && case "${TARGETARCH}" in arm64) FFARCH=arm64 ;; *) FFARCH=amd64 ;; esac \
 && curl -fsSL "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${FFARCH}-static.tar.xz" -o /tmp/ffmpeg.tar.xz \
 && mkdir -p /tmp/ff \
 && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/ff \
 && cp /tmp/ff/ffmpeg-*-${FFARCH}-static/ffmpeg /usr/local/bin/ \
 && cp /tmp/ff/ffmpeg-*-${FFARCH}-static/ffprobe /usr/local/bin/ \
 && chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe \
 && rm -rf /tmp/ff /tmp/ffmpeg.tar.xz \
 && dnf clean all

WORKDIR /var/task
COPY --from=builder /deploy/dist ./dist
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./

CMD ["dist/index.handler"]
