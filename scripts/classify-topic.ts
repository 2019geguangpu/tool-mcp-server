#!/usr/bin/env node
/**
 * Phase 0：CLI 测试客服 Agent 意图分类与 handoff 产出
 *
 * 用法：
 *   pnpm run classify-topic -- "消息正文"
 *   pnpm run classify-topic -- --file ./message.txt
 *   echo "消息" | pnpm run classify-topic
 *   pnpm run classify-topic -- --thread om_xxx --source discord "反馈内容"
 */
import fs from "fs/promises";
import { runCustomerService } from "../src/agents/customer-service/index.js";
import type { ClassifierMode } from "../src/agents/types.js";

type CliOpts = {
  text: string | null;
  file: string | null;
  thread: string | null;
  source: string | null;
  mode: ClassifierMode;
  help: boolean;
};

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = {
    text: null,
    file: null,
    thread: null,
    source: null,
    mode: "heuristic",
    help: false,
  };

  const positional: string[] = [];
  const args = argv.slice(2).filter((arg) => arg !== "--");

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--file" && args[i + 1]) {
      opts.file = args[++i] ?? null;
    } else if (arg === "--thread" && args[i + 1]) {
      opts.thread = args[++i] ?? null;
    } else if (arg === "--source" && args[i + 1]) {
      opts.source = args[++i] ?? null;
    } else if (arg === "--mode" && args[i + 1]) {
      const mode = args[++i];
      if (mode === "heuristic" || mode === "llm") {
        opts.mode = mode;
      } else {
        throw new Error(`无效的 --mode "${mode}"，允许：heuristic | llm`);
      }
    } else if (arg.startsWith("-")) {
      throw new Error(`未知参数: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    opts.text = positional.join(" ");
  }

  return opts;
}

function printHelp(): void {
  console.log(`用法: pnpm run classify-topic -- [选项] [消息正文]

选项:
  --file <path>      从文件读取消息
  --thread <id>      飞书话题 ID（写入 handoff）
  --source <name>    来源标识，如 discord / feishu_group
  --mode heuristic   规则分类
  --mode llm         SiliconFlow LLM 分类（需 SILICONFLOW_API_KEY）
  未指定 --mode 时：有 API Key 默认 llm，否则 heuristic
  -h, --help         显示帮助

示例:
  pnpm run classify-topic -- "模型超时，playable 不更新"
  echo "希望支持导出链接" | pnpm run classify-topic
`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function resolveMessage(opts: CliOpts): Promise<string> {
  if (opts.file) {
    return (await fs.readFile(opts.file, "utf8")).trim();
  }
  if (opts.text) return opts.text.trim();
  const stdin = await readStdin();
  if (stdin) return stdin;
  throw new Error("请提供消息正文、--file 或通过 stdin 传入");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const text = await resolveMessage(opts);
  const result = await runCustomerService({
    text,
    feishu_thread_id: opts.thread ?? undefined,
    source: opts.source ?? undefined,
    classifier_mode: opts.mode,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`classify-topic 失败: ${message}`);
  process.exit(1);
});
