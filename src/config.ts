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

const DEFAULT_BIZ_CORE_LOG_GROUPS = [
  "/ecs/leap_server_prod_biz_core_service",
  "/ecs/leap_server_prod_biz_core_service/logbus2",
  "/ecs/leap_server_prod_biz_core_service/loongcollector",
  "/ecs/biz_core_service",
];

function parseLogGroups(raw: string | undefined): string[] {
  if (!raw?.trim()) return DEFAULT_BIZ_CORE_LOG_GROUPS;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCsv(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  mockCloudWatchTools: envBool("MOCK_CLOUDWATCH_TOOLS", false),
  aws: {
    region: process.env.AWS_REGION || "us-east-1",
    defaultLogGroups: parseLogGroups(process.env.BIZ_CORE_LOG_GROUPS),
    defaultHours: Number(process.env.BIZ_CORE_LOG_HOURS_DEFAULT || 3),
  },
  log: {
    level: logLevel as LogLevel,
    dir: process.env.LOG_DIR || path.join(projectRoot, "logs"),
    toFile: envBool("LOG_TO_FILE", true),
  },
  audit: {
    enabled: envBool("AUDIT_TOOLS", true),
    dir: process.env.AUDIT_DIR || path.join(projectRoot, "logs", "calls"),
  },
  feishu: {
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || "",
    userAccessToken: process.env.FEISHU_USER_ACCESS_TOKEN || "",
    notesFolderTokens: parseCsv(process.env.FEISHU_NOTES_FOLDER_TOKENS),
    searchDocTypes: ["DOCX", "DOC"] as const,
    searchPageSize: Number(process.env.FEISHU_SEARCH_PAGE_SIZE || 10),
    maxDocChars: Number(process.env.FEISHU_MAX_DOC_CHARS || 48_000),
    maxImagesPerDoc: Number(process.env.FEISHU_MAX_IMAGES || 30),
    maxImageBytes: Number(process.env.FEISHU_MAX_IMAGE_BYTES || 5 * 1024 * 1024),
    mockFeishuTools: envBool("MOCK_FEISHU_TOOLS", false),
  },
} as const;
