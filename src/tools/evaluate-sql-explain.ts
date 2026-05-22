import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { MOCK_EXPLAIN_JSON } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import { assertSelectOnly } from "../lib/validators.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = { sql_query: string };

async function handleEvaluateSqlExplain({
  sql_query,
}: Args): Promise<ToolCallResult> {
  try {
    const sql = assertSelectOnly(sql_query);
    if (config.mockDbTools) {
      return {
        content: [
          {
            type: "text",
            text: `【MOCK 执行计划 JSON】:\n${MOCK_EXPLAIN_JSON}\n\n（mock 模式，未执行真实 EXPLAIN）\n\n请分析此计划的 query_cost、扫表行数及是否发生 filesort。`,
          },
        ],
      };
    }
    const [rows] = await pool.query<RowDataPacket[]>(
      `EXPLAIN FORMAT=JSON ${sql}`
    );
    const first = rows[0];
    if (!first) {
      return toolError("EXPLAIN 未返回结果。");
    }
    const jsonPlan = Object.values(first)[0];
    return {
      content: [
        {
          type: "text",
          text: `【执行计划 JSON】:\n${String(jsonPlan)}\n\n请分析此计划的 query_cost、扫表行数及是否发生 filesort。`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const evaluateSqlExplainTool: RegisteredTool<Args> = {
  name: "evaluate_sql_explain",
  definition: {
    description:
      "在生成新的 SELECT 查询，或修改表索引前，必须调用此工具对 SQL 进行 EXPLAIN 效率评估。",
    inputSchema: {
      sql_query: z.string().describe("需要评估的完整 SELECT SQL"),
    },
  },
  handler: wrapToolHandler("evaluate_sql_explain", handleEvaluateSqlExplain),
};
