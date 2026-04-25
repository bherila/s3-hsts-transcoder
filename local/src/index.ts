import "dotenv/config";
import { createLogger, loadConfig, runOnce, VERSION } from "@s3-hsts-transcoder/lib";

async function main(): Promise<void> {
  const config = loadConfig("local");
  const logger = createLogger(config.logLevel);
  logger.info("transcoder starting", {
    platform: "local",
    lib: VERSION,
    pairs: config.pairs.length,
  });

  const summary = await runOnce({ config, logger });
  if (summary.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
