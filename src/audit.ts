import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { AuditRecord, ToolCallResult, ToolResultSummary } from "./types.js";

let auditDirReady = false;

const jsonlPath = () => path.join(config.log.dir, "tool-calls.jsonl");

async function ensureAuditDir(): Promise<void> {
  if (auditDirReady || !config.audit.enabled) return;
  await fs.mkdir(config.audit.dir, { recursive: true });
  await fs.mkdir(config.log.dir, { recursive: true });
  auditDirReady = true;
}

function summarizeResult(result: ToolCallResult): ToolResultSummary {
  if (!result.content.length) {
    return { contentCount: 0, isError: false, preview: "", textLength: 0 };
  }
  const text = result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const preview = text.length > 500 ? `${text.slice(0, 500)}…` : text;
  return {
    contentCount: result.content.length,
    isError: Boolean(result.isError),
    preview,
    textLength: text.length,
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
    summary: result ? summarizeResult(result) : null,
    error: error
      ? error instanceof Error
        ? error.message
        : String(error)
      : null,
    result: result ?? null,
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
