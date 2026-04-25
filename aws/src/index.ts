import { createLogger, loadConfig, runOnce, VERSION } from "@s3-hsts-transcoder/lib";

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  const config = loadConfig("aws-lambda");
  const logger = createLogger(config.logLevel);
  logger.info("transcoder starting", {
    platform: "aws-lambda",
    lib: VERSION,
    pairs: config.pairs.length,
  });

  const summary = await runOnce({ config, logger });
  return {
    statusCode: summary.failed > 0 ? 500 : 200,
    body: JSON.stringify(summary),
  };
};
