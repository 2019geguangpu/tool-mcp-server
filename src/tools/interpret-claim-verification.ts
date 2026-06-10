import { z } from "zod";
import { interpretClaimVerification } from "../lib/interpret-claim-verification.js";
import { toolError } from "../lib/responses.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  user_id: string;
  project_name?: string;
  claim_summary?: string;
  query_rows: string;
  name_column?: string;
  status_column?: string;
  deleted_at_column?: string;
};

function parseQueryRows(raw: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("query_rows 必须是 JSON 数组字符串（来自 query_live_select 结果）。");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("query_rows 必须是对象数组。");
  }
  return parsed as Record<string, unknown>[];
}

async function handleInterpretClaimVerification(
  args: Args
): Promise<ToolCallResult> {
  try {
    const user_id = args.user_id?.trim();
    if (!user_id) {
      return {
        content: [{ type: "text", text: "user_id 不能为空。" }],
        isError: true,
      };
    }

    const result = interpretClaimVerification({
      user_id,
      project_name: args.project_name?.trim() || undefined,
      claim_summary: args.claim_summary?.trim() || undefined,
      query_rows: parseQueryRows(args.query_rows),
      field_map: {
        nameColumn: args.name_column?.trim() || undefined,
        statusColumn: args.status_column?.trim() || undefined,
        deletedAtColumn: args.deleted_at_column?.trim() || undefined,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: [
            "【用户主张核实结论】",
            "",
            `verdict: ${result.verdict}`,
            `verification_status: ${result.verification_status}`,
            `summary: ${result.summary}`,
            "",
            "evidence:",
            ...result.evidence.map((e) => `- ${e}`),
            "",
            "matched_projects:",
            JSON.stringify(result.matched_projects, null, 2),
            "",
            "draft_projects:",
            JSON.stringify(result.draft_projects, null, 2),
          ].join("\n"),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const interpretClaimVerificationTool: RegisteredTool<Args> = {
  name: "interpret_claim_verification",
  definition: {
    description:
      "根据线上库 query_live_select 的查询结果，判断用户主张是否成立（verified/refuted/partially_true/inconclusive）。前置：在 live MCP 用 list_live_tables、get_live_table_schema 探表后执行 SELECT，再把结果 JSON 传入 query_rows。适用于 support/data_recovery 等需核实的个案，无需预配置表名。",
    inputSchema: {
      user_id: z.string().min(1).describe("用户数字 UID"),
      project_name: z.string().optional().describe("作品/游戏名"),
      claim_summary: z.string().optional().describe("用户主张摘要"),
      query_rows: z
        .string()
        .min(2)
        .describe(
          "query_live_select 返回的行数组 JSON 字符串，如 [{\"id\":1,\"title\":\"neon patrol\",\"status\":\"draft\"}]"
        ),
      name_column: z
        .string()
        .optional()
        .describe("可选：名称列名（未填则根据结果行自动推断）"),
      status_column: z.string().optional().describe("可选：状态列名"),
      deleted_at_column: z.string().optional().describe("可选：软删时间列名"),
    },
  },
  handler: wrapToolHandler(
    "interpret_claim_verification",
    handleInterpretClaimVerification
  ),
};
