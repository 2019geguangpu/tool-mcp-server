import fs from "fs/promises";
import path from "path";
import { config } from "./config.js";
import type { LogFields, LogLevel } from "./types.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel = LEVELS[config.log.level] ?? LEVELS.info;

let logFilePath: string | null = null;
let logDirReady = false;

async function ensureLogDir(): Promise<void> {
  if (logDirReady || !config.log.toFile) return;
  await fs.mkdir(config.log.dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  logFilePath = path.join(config.log.dir, `mcp-${date}.log`);
  logDirReady = true;
}

function formatLine(level: LogLevel, event: string, fields: LogFields): string {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  return JSON.stringify(payload);
}

function shouldLog(level: LogLevel): boolean {
  return (LEVELS[level] ?? LEVELS.info) >= minLevel;
}

async function write(
  level: LogLevel,
  event: string,
  fields: LogFields = {}
): Promise<void> {
  if (!shouldLog(level)) return;
  const line = formatLine(level, event, fields);
  console.error(line);
  if (!config.log.toFile) return;
  try {
    await ensureLogDir();
    if (!logFilePath) return;
    await fs.appendFile(logFilePath, `${line}\n`, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(formatLine("error", "log_write_failed", { message }));
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
