import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { mockReadonlyRows } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import {
  buildAnalyzeParseRejectedMessage,
  buildAnalyzeRejectedMessage,
  buildExplainRejectedMessage,
  evaluateExplain,
  formatExplainSummary,
  MAX_ANALYZE_MS,
  MAX_SELECT_MS,
  summarizeAnalyzeOutput,
  summarizeExplainJson,
  type AnalyzeSummary,
  type ExplainSummary,
} from "../lib/sql-safety.js";
import { assertSelectOnly } from "../lib/validators.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = { sql_query: string; limit_rows?: number };
type LiveConnection = Awaited<ReturnType<typeof pool.getConnection>>;

const DEFAULT_LIMIT_ROWS = 20;
const MAX_LIMIT_ROWS = 100;

const UNSAFE_SELECT_PATTERNS = [
  /\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i,
  /\bFOR\s+UPDATE\b/i,
  /\bLOCK\s+IN\s+SHARE\s+MODE\b/i,
  /\bGET_LOCK\s*\(/i,
  /\bRELEASE_LOCK\s*\(/i,
  /\bSLEEP\s*\(/i,
  /\bBENCHMARK\s*\(/i,
];

function normalizeLimit(limitRows: number | undefined): number {
  if (limitRows === undefined) return DEFAULT_LIMIT_ROWS;
  if (!Number.isInteger(limitRows) || limitRows < 1) {
    throw new Error("limit_rows 必须是大于 0 的整数。");
  }
  return Math.min(limitRows, MAX_LIMIT_ROWS);
}

function assertReadonlySelect(sqlQuery: string): string {
  const sql = assertSelectOnly(sqlQuery, "只读查询");
  if (sql.includes(";")) {
    throw new Error("仅允许单条 SELECT 查询，禁止多语句。");
  }
  for (const pattern of UNSAFE_SELECT_PATTERNS) {
    if (pattern.test(sql)) {
      throw new Error("此 SELECT 包含潜在副作用或锁定语义，已拒绝执行。");
    }
  }
  return sql;
}

function safetyError(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: `【SELECT 安全检查未通过】\n${message}` }],
    isError: true,
  };
}

async function rollback(connection: LiveConnection): Promise<void> {
  await connection.query("ROLLBACK").catch(() => undefined);
}

async function runExplain(
  connection: LiveConnection,
  sql: string
): Promise<ExplainSummary> {
  const [rows] = await connection
    .query<RowDataPacket[]>(`EXPLAIN FORMAT=JSON ${sql}`)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `EXPLAIN FORMAT=JSON 执行失败，未执行 EXPLAIN ANALYZE / SELECT：${message}`
      );
    });
  const rawJson = String(Object.values(rows[0] ?? {})[0] ?? "");
  if (!rawJson) {
    throw new Error("EXPLAIN FORMAT=JSON 未返回执行计划。");
  }
  return summarizeExplainJson(rawJson);
}

async function runAnalyze(
  connection: LiveConnection,
  sql: string
): Promise<AnalyzeSummary> {
  const [rows] = await connection
    .query<RowDataPacket[]>(`EXPLAIN ANALYZE ${sql}`)
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `EXPLAIN ANALYZE 执行失败，未执行 SELECT：${message}`
      );
    });
  const rawText = rows
    .map((row) => Object.values(row).map(String).join("\n"))
    .join("\n");
  if (!rawText) {
    throw new Error("EXPLAIN ANALYZE 未返回执行结果。");
  }
  return summarizeAnalyzeOutput(rawText);
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return value;
}

function normalizeRows(rows: RowDataPacket[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value);
    }
    return normalized;
  });
}

function formatRows(
  rows: Record<string, unknown>[],
  limitRows: number,
  explainSummary: ExplainSummary | null,
  analyzeSummary: AnalyzeSummary | null
): string {
  const envLabel = config.mcpProfile === "test" ? "测试库" : "线上";
  const lines = [
    `【${envLabel} SELECT 查询结果】返回 ${rows.length} 行（最多 ${limitRows} 行）`,
  ];

  if (explainSummary && analyzeSummary) {
    lines.push(
      "",
      "【安全检查摘要】",
      formatExplainSummary(explainSummary),
      `explain_analyze_actual_time_ms=${analyzeSummary.maxActualTimeMs ?? "unknown"}`,
      `max_analyze_time_ms=${MAX_ANALYZE_MS}`,
      `max_select_execution_time_ms=${MAX_SELECT_MS}`
    );
  }

  lines.push("", JSON.stringify(rows, null, 2));
  return lines.join("\n");
}

async function handleSafetyChecks(
  connection: LiveConnection,
  sql: string
): Promise<
  | { ok: true; explainSummary: ExplainSummary; analyzeSummary: AnalyzeSummary }
  | { ok: false; result: ToolCallResult }
> {
  const explainSummary = await runExplain(connection, sql);
  const explainErrors = evaluateExplain(explainSummary);
  if (explainErrors.length > 0) {
    await rollback(connection);
    return {
      ok: false,
      result: safetyError(
        buildExplainRejectedMessage(explainErrors, explainSummary)
      ),
    };
  }

  const analyzeSummary = await runAnalyze(connection, sql);
  if (analyzeSummary.maxActualTimeMs === null) {
    await rollback(connection);
    return {
      ok: false,
      result: safetyError(buildAnalyzeParseRejectedMessage(analyzeSummary)),
    };
  }
  if (analyzeSummary.maxActualTimeMs > MAX_ANALYZE_MS) {
    await rollback(connection);
    return {
      ok: false,
      result: safetyError(
        buildAnalyzeRejectedMessage(explainSummary, analyzeSummary)
      ),
    };
  }

  return { ok: true, explainSummary, analyzeSummary };
}

async function handleQueryLiveSelect({
  sql_query,
  limit_rows,
}: Args): Promise<ToolCallResult> {
  try {
    const sql = assertReadonlySelect(sql_query);
    const limitRows = normalizeLimit(limit_rows);

    if (config.mockDbTools) {
      const rows = mockReadonlyRows().slice(0, limitRows);
      return {
        content: [
          {
            type: "text",
            text: `【MOCK 线上 SELECT 查询结果】\n${formatRows(
              rows,
              limitRows,
              null,
              null
            )}`,
          },
        ],
      };
    }

    const connection = await pool.getConnection();
    try {
      await connection.query("SET SESSION MAX_EXECUTION_TIME = ?", [
        MAX_SELECT_MS,
      ]);
      await connection.query("START TRANSACTION READ ONLY");

      const useExplainGate = config.mcpProfile === "live";
      let explainSummary: ExplainSummary | null = null;
      let analyzeSummary: AnalyzeSummary | null = null;

      if (useExplainGate) {
        const safety = await handleSafetyChecks(connection, sql);
        if (!safety.ok) return safety.result;
        explainSummary = safety.explainSummary;
        analyzeSummary = safety.analyzeSummary;
      }

      const [rows] = await connection
        .query<RowDataPacket[]>(
          `SELECT * FROM (${sql}) AS mcp_readonly_result LIMIT ${limitRows}`
        )
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          const gateHint = useExplainGate
            ? "（EXPLAIN 和 EXPLAIN ANALYZE 已通过）"
            : "";
          throw new Error(`SELECT 执行失败${gateHint}：${message}`);
        });
      await rollback(connection);

      return {
        content: [
          {
            type: "text",
            text: formatRows(
              normalizeRows(rows),
              limitRows,
              explainSummary,
              analyzeSummary
            ),
          },
        ],
      };
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      await connection
        .query("SET SESSION MAX_EXECUTION_TIME = 0")
        .catch(() => undefined);
      connection.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const queryLiveSelectTool: RegisteredTool<Args> = {
  name: "query_live_select",
  definition: {
    description:
      "执行只读 SELECT 并返回查询结果。仅允许单条 SELECT/WITH 查询。MCP_PROFILE=live 时必须先通过 EXPLAIN FORMAT=JSON 与 EXPLAIN ANALYZE 门禁；MCP_PROFILE=test 时在只读事务中直接执行（无 EXPLAIN 门禁，仅行数上限）。",
    inputSchema: {
      sql_query: z.string().describe("需要执行的完整 SELECT SQL"),
      limit_rows: z
        .number()
        .int()
        .positive()
        .max(MAX_LIMIT_ROWS)
        .optional()
        .describe(`最多返回行数，默认 ${DEFAULT_LIMIT_ROWS}，最大 ${MAX_LIMIT_ROWS}`),
    },
  },
  handler: wrapToolHandler("query_live_select", handleQueryLiveSelect),
};
