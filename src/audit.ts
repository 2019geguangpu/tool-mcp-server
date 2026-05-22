import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type {
  AuditRecord,
  ToolCallResult,
  ToolContent,
  ToolResultSummary,
} from "./types.js";

/** read_feishu_doc 审计详情中正文最多保留字符数（含图片元信息，不含 base64） */
const FEISHU_READ_AUDIT_TEXT_MAX = 100;

const AUDIT_TRUNCATE_RESULT_TOOLS = new Set(["read_feishu_doc"]);

let auditDirReady = false;

const jsonlPath = () => path.join(config.log.dir, "tool-calls.jsonl");

async function ensureAuditDir(): Promise<void> {
  if (auditDirReady || !config.audit.enabled) return;
  await fs.mkdir(config.audit.dir, { recursive: true });
  await fs.mkdir(config.log.dir, { recursive: true });
  auditDirReady = true;
}

function summarizeResult(
  result: ToolCallResult,
  toolName: string
): ToolResultSummary {
  if (!result.content.length) {
    return { contentCount: 0, isError: false, preview: "", textLength: 0 };
  }
  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const imageCount = result.content.filter((c) => c.type === "image").length;
  const previewLimit = toolName === "read_feishu_doc" ? FEISHU_READ_AUDIT_TEXT_MAX : 500;
  const previewBase =
    text.length > previewLimit ? `${text.slice(0, previewLimit)}…` : text;
  const preview =
    imageCount > 0
      ? `${previewBase}${previewBase ? "\n" : ""}[${imageCount} 张图片，审计未存 base64]`
      : previewBase;
  return {
    contentCount: result.content.length,
    isError: Boolean(result.isError),
    preview,
    textLength: text.length,
  };
}

/** 飞书读文档工具：审计文件不存全文与图片二进制 */
function sanitizeResultForAudit(
  toolName: string,
  result: ToolCallResult
): ToolCallResult {
  if (!AUDIT_TRUNCATE_RESULT_TOOLS.has(toolName)) {
    return result;
  }

  const text = result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const imageCount = result.content.filter((c) => c.type === "image").length;

  const truncated =
    text.length > FEISHU_READ_AUDIT_TEXT_MAX
      ? `${text.slice(0, FEISHU_READ_AUDIT_TEXT_MAX)}…`
      : text;

  const auditContent: ToolContent[] = [
    {
      type: "text",
      text:
        truncated +
        (imageCount > 0 ? `\n（审计省略 ${imageCount} 张图片的 base64）` : ""),
    },
  ];

  return {
    isError: result.isError,
    content: auditContent,
  };
}

export function newCallId(): string {
  return randomUUID();
}

export type RecordToolCallInput = {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: ToolCallResult;
  durationMs: number;
  startedAt: number;
  error?: unknown;
};

export async function recordToolCall(input: RecordToolCallInput): Promise<void> {
  const { callId, toolName, args, result, durationMs, startedAt, error } =
    input;

  if (!config.audit.enabled) return;

  const record: AuditRecord = {
    callId,
    toolName,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    args,
    summary: result ? summarizeResult(result, toolName) : null,
    error: error
      ? error instanceof Error
        ? error.message
        : String(error)
      : null,
    result: result ? sanitizeResultForAudit(toolName, result) : null,
  };

  try {
    await ensureAuditDir();
    const line = `${JSON.stringify(record)}\n`;
    await fs.appendFile(jsonlPath(), line, "utf8");

    const detailPath = path.join(
      config.audit.dir,
      `${record.startedAt.replace(/[:.]/g, "-")}_${toolName}_${callId.slice(0, 8)}.json`
    );
    await fs.writeFile(detailPath, JSON.stringify(record, null, 2), "utf8");

    logger.debug("audit_recorded", {
      callId,
      toolName,
      detailPath,
      jsonl: jsonlPath(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("audit_write_failed", { callId, toolName, message });
  }
}
