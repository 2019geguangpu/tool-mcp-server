import { z } from "zod";
import { runCustomerService } from "../agents/customer-service/index.js";
import { formatCustomerServiceResult } from "../agents/customer-service/format-result.js";
import { parseClassifierMode } from "../lib/classifier-mode.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  message: string;
  feishu_thread_id?: string;
  source?: string;
  classifier_mode?: string;
};

async function handleAnalyzeCustomerMessage(args: Args): Promise<ToolCallResult> {
  const message = args.message?.trim();
  if (!message) {
    return {
      content: [{ type: "text", text: "message 不能为空。" }],
      isError: true,
    };
  }

  const result = await runCustomerService({
    text: message,
    feishu_thread_id: args.feishu_thread_id?.trim() || undefined,
    source: args.source?.trim() || "cursor",
    classifier_mode: parseClassifierMode(args.classifier_mode),
  });

  return {
    content: [{ type: "text", text: formatCustomerServiceResult(result) }],
  };
}

export const analyzeCustomerMessageTool: RegisteredTool<Args> = {
  name: "analyze_customer_message",
  definition: {
    description:
      "触发客服 Agent，分析用户在对话中粘贴的反馈文本（报 bug、提需求、运营个案、情绪发泄等），返回意图分类、工单池路由与结构化 handoff。在 Cursor 里收到用户反馈原文时调用；不要用于查库、读飞书文档或搜笔记。",
    inputSchema: {
      message: z
        .string()
        .min(1)
        .describe("待分析的反馈正文，通常直接粘贴用户在对话里发的消息"),
      feishu_thread_id: z
        .string()
        .optional()
        .describe("可选：对应飞书话题 thread_id，便于后续 handoff 关联"),
      source: z
        .string()
        .optional()
        .describe('来源标识，默认 "cursor"'),
      classifier_mode: z
        .enum(["heuristic", "llm"])
        .optional()
        .describe(
          "分类模式：llm（SiliconFlow）或 heuristic（规则）。未指定时：有 SILICONFLOW_API_KEY 则用 llm"
        ),
    },
  },
  handler: wrapToolHandler("analyze_customer_message", handleAnalyzeCustomerMessage),
};
