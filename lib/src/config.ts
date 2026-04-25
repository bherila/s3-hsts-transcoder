export type Platform = "aws-lambda" | "cloudflare-container" | "local";

export interface BucketConfig {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  prefix?: string;
}

export interface LadderRung {
  name: string;
  width: number;
  height: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
}

export interface Config {
  source: BucketConfig;
  dest: BucketConfig;
  ladder: LadderRung[];
  maxRuntimeSeconds: number;
  lockTtlMultiplier: number;
  budgetMultiplier: number;
  perceptualThreshold: number;
  perceptualDryRun: boolean;
  maxConcurrency: number;
  logLevel: "debug" | "info" | "warn" | "error";
  platform: Platform;
}

export const DEFAULT_LADDER: readonly LadderRung[] = [
  { name: "360p",  width: 640,  height: 360,  videoBitrateKbps: 800,  audioBitrateKbps: 96  },
  { name: "480p",  width: 854,  height: 480,  videoBitrateKbps: 1400, audioBitrateKbps: 128 },
  { name: "720p",  width: 1280, height: 720,  videoBitrateKbps: 2800, audioBitrateKbps: 128 },
  { name: "1080p", width: 1920, height: 1080, videoBitrateKbps: 5000, audioBitrateKbps: 192 },
];

const PLATFORM_DEFAULT_MAX_RUNTIME = {
  "aws-lambda": 900,
  "cloudflare-container": 3600,
  local: 3600,
} as const satisfies Record<Platform, number>;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function parseLadder(raw: string | undefined): LadderRung[] {
  if (!raw) return [...DEFAULT_LADDER];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("HLS_LADDER must be a non-empty JSON array");
  }
  for (const rung of parsed) {
    if (
      typeof rung !== "object" || rung === null ||
      typeof rung.name !== "string" ||
      typeof rung.width !== "number" ||
      typeof rung.height !== "number" ||
      typeof rung.videoBitrateKbps !== "number" ||
      typeof rung.audioBitrateKbps !== "number"
    ) {
      throw new Error(`HLS_LADDER rung is malformed: ${JSON.stringify(rung)}`);
    }
  }
  return parsed as LadderRung[];
}

function parseLogLevel(raw: string | undefined): Config["logLevel"] {
  const v = (raw ?? "info").toLowerCase();
  if (v !== "debug" && v !== "info" && v !== "warn" && v !== "error") {
    throw new Error(`LOG_LEVEL must be debug|info|warn|error, got: ${raw}`);
  }
  return v;
}

function parseNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be numeric, got: ${raw}`);
  return n;
}

export function loadConfig(platform: Platform): Config {
  const platformDefaultRuntime = PLATFORM_DEFAULT_MAX_RUNTIME[platform];

  return {
    source: {
      bucket: required("SOURCE_BUCKET"),
      endpoint: required("SOURCE_ENDPOINT"),
      accessKeyId: required("SOURCE_ACCESS_KEY_ID"),
      secretAccessKey: required("SOURCE_SECRET_ACCESS_KEY"),
      region: optional("SOURCE_REGION", "auto"),
      prefix: process.env.SOURCE_PREFIX || undefined,
    },
    dest: {
      bucket: required("DEST_BUCKET"),
      endpoint: required("DEST_ENDPOINT"),
      accessKeyId: required("DEST_ACCESS_KEY_ID"),
      secretAccessKey: required("DEST_SECRET_ACCESS_KEY"),
      region: optional("DEST_REGION", "auto"),
    },
    ladder: parseLadder(process.env.HLS_LADDER),
    maxRuntimeSeconds: parseNumber("MAX_RUNTIME_SECONDS", process.env.MAX_RUNTIME_SECONDS, platformDefaultRuntime),
    lockTtlMultiplier: parseNumber("LOCK_TTL_MULTIPLIER", process.env.LOCK_TTL_MULTIPLIER, 1.5),
    budgetMultiplier: parseNumber("BUDGET_MULTIPLIER", process.env.BUDGET_MULTIPLIER, 0.75),
    perceptualThreshold: parseNumber("PERCEPTUAL_THRESHOLD", process.env.PERCEPTUAL_THRESHOLD, 0.95),
    perceptualDryRun: process.env.PERCEPTUAL_DRY_RUN === "true",
    maxConcurrency: parseNumber("MAX_CONCURRENCY", process.env.MAX_CONCURRENCY, 1),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    platform,
  };
}
