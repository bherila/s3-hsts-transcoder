export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: LogLevel): Logger {
  const threshold = LEVELS[level];

  function emit(lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (LEVELS[lvl] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...(fields ?? {}),
    };
    const line = JSON.stringify(entry);
    if (lvl === "error" || lvl === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}
