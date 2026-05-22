#!/usr/bin/env node
/**
 * 查看 MCP 工具调用审计记录
 */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { AuditRecord } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const jsonlPath =
  process.env.AUDIT_JSONL ||
  path.join(
    process.env.LOG_DIR || path.join(projectRoot, "logs"),
    "tool-calls.jsonl"
  );

type ViewOpts = {
  count: number;
  id: string | null;
  last: boolean;
  help?: boolean;
};

function parseArgs(argv: string[]): ViewOpts {
  const opts: ViewOpts = { count: 10, id: null, last: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--last") opts.last = true;
    else if (arg === "--id" && argv[i + 1]) {
      opts.id = argv[++i] ?? null;
    } else if ((arg === "-n" || arg === "--count") && argv[i + 1]) {
      opts.count = Number(argv[++i]) || 10;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

async function readAllRecords(): Promise<AuditRecord[]> {
  try {
    const raw = await fs.readFile(jsonlPath, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditRecord);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
}

function printHelp(): void {
  console.log(`工具调用审计查看器

JSONL: ${jsonlPath}

命令:
  pnpm run logs              最近 10 条摘要
  pnpm run logs -- -n 20     最近 20 条
  node dist/view-logs.js --id <uuid>  完整记录
  pnpm run logs:last         最近一条完整 JSON
`);
}

function printSummary(records: AuditRecord[]): void {
  for (const r of records) {
    const status = r.error
      ? "ERROR"
      : r.summary?.isError
        ? "TOOL_ERROR"
        : "OK";
    console.log(
      `[${r.startedAt}] ${status} ${r.toolName} (${r.durationMs}ms) id=${r.callId}`
    );
    if (r.summary?.preview) {
      const line = r.summary.preview.replace(/\s+/g, " ").trim();
      console.log(`  preview: ${line.slice(0, 120)}`);
    }
    if (r.error) console.log(`  error: ${r.error}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const records = await readAllRecords();
  if (records.length === 0) {
    console.log(`暂无记录。路径: ${jsonlPath}`);
    console.log(
      "请先通过 Cursor 调用 MCP 工具，或确认 LOG_DIR / AUDIT_TOOLS 配置。"
    );
    return;
  }

  if (opts.id) {
    const found = records.filter((r) => r.callId.startsWith(opts.id!));
    if (found.length === 0) {
      console.log(`未找到 callId 前缀: ${opts.id}`);
      process.exit(1);
    }
    for (const r of found) console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (opts.last) {
    console.log(JSON.stringify(records[records.length - 1], null, 2));
    return;
  }

  const slice = records.slice(-opts.count);
  printSummary(slice);
  console.log(
    `\n共 ${records.length} 条，显示最近 ${slice.length} 条。完整结果: --last 或 --id <callId>`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
