import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import type { LogLevel } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** 编译后在 dist/，上一级即项目根目录 */
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({
  path: process.env.DOTENV_CONFIG_PATH || path.join(projectRoot, ".env"),
});

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw === "true" || raw === "1";
}

const logLevel = (process.env.LOG_LEVEL || "info").toLowerCase();

export const config = {
  projectRoot,
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3906),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "test",
  },
  mockDbTools: envBool("MOCK_DB_TOOLS", false),
  log: {
    level: logLevel as LogLevel,
    dir: process.env.LOG_DIR || path.join(projectRoot, "logs"),
    toFile: envBool("LOG_TO_FILE", true),
  },
  audit: {
    enabled: envBool("AUDIT_TOOLS", true),
    dir: process.env.AUDIT_DIR || path.join(projectRoot, "logs", "calls"),
  },
} as const;
