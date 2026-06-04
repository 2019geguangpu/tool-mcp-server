import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { mockUpdatedRows } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import {
  formatDryRunResult,
  formatExecuteResult,
  normalizeRows,
  type DbValue,
} from "../lib/test-db-update.js";
import {
  assertTestDbWriteExecution,
  assertTestProfile,
  CONFIRM_TEST_DB_UPDATE,
} from "../lib/test-db-write-guard.js";
import { assertSafeIdentifier, assertSafeTableName } from "../lib/validators.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  table_name: string;
  set_values: Record<string, DbValue>;
  where_equals: Record<string, DbValue>;
  dry_run?: boolean;
  max_affected_rows?: number;
  confirm_execute?: string;
};

type LiveConnection = Awaited<ReturnType<typeof pool.getConnection>>;

interface CountRow extends RowDataPacket {
  row_count: number | string | bigint;
}

const DbValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const DEFAULT_MAX_AFFECTED_ROWS = 20;
const MAX_AFFECTED_ROWS = 100;
const PREVIEW_ROWS = 20;
function quoteIdentifier(identifier: string): string {
  return `\`${identifier}\``;
}

function normalizeMaxAffectedRows(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_AFFECTED_ROWS;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("max_affected_rows 必须是大于 0 的整数。");
  }
  return Math.min(value, MAX_AFFECTED_ROWS);
}

function objectEntries(
  value: Record<string, DbValue>,
  label: string
): [string, DbValue][] {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${label} 不能为空。`);
  }
  for (const [key] of entries) {
    assertSafeIdentifier(key, `${label} 字段名`);
  }
  return entries;
}

function buildWhereClause(entries: [string, DbValue][]): {
  sql: string;
  params: DbValue[];
} {
  const clauses: string[] = [];
  const params: DbValue[] = [];

  for (const [column, value] of entries) {
    if (value === null) {
      clauses.push(`${quoteIdentifier(column)} IS NULL`);
    } else {
      clauses.push(`${quoteIdentifier(column)} = ?`);
      params.push(value);
    }
  }

  return {
    sql: clauses.join(" AND "),
    params,
  };
}

function buildSetClause(entries: [string, DbValue][]): {
  sql: string;
  params: DbValue[];
} {
  return {
    sql: entries.map(([column]) => `${quoteIdentifier(column)} = ?`).join(", "),
    params: entries.map(([, value]) => value),
  };
}

function safetyError(message: string): ToolCallResult {
  return {
    content: [{ type: "text", text: `【测试库 UPDATE 安全检查未通过】\n${message}` }],
    isError: true,
  };
}

async function rollback(connection: LiveConnection): Promise<void> {
  await connection.query("ROLLBACK").catch(() => undefined);
}

async function getMatchingCount(
  connection: LiveConnection,
  tableName: string,
  whereSql: string,
  whereParams: DbValue[]
): Promise<number> {
  const [rows] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS row_count FROM ${quoteIdentifier(tableName)} WHERE ${whereSql}`,
    whereParams
  );
  return Number(rows[0]?.row_count ?? 0);
}

async function getPreviewRows(
  connection: LiveConnection,
  tableName: string,
  whereSql: string,
  whereParams: DbValue[],
  maxAffectedRows: number
): Promise<Record<string, unknown>[]> {
  const limitRows = Math.min(maxAffectedRows, PREVIEW_ROWS);
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${whereSql} LIMIT ${limitRows}`,
    whereParams
  );
  return normalizeRows(rows);
}

async function handleUpdateTestDbRows({
  table_name,
  set_values,
  where_equals,
  dry_run,
  max_affected_rows,
  confirm_execute,
}: Args): Promise<ToolCallResult> {
  try {
    assertTestProfile("update_test_db_rows");
    assertSafeTableName(table_name);
    const setEntries = objectEntries(set_values, "SET");
    const whereEntries = objectEntries(where_equals, "WHERE");
    const maxAffectedRows = normalizeMaxAffectedRows(max_affected_rows);
    const shouldDryRun = dry_run !== false;

    if (config.mockDbTools) {
      const previewRows = mockUpdatedRows().slice(0, maxAffectedRows);
      return {
        content: [
          {
            type: "text",
            text: shouldDryRun
              ? `【MOCK】\n${formatDryRunResult({
                  tableName: table_name,
                  setValues: set_values,
                  whereEquals: where_equals,
                  matchedRows: previewRows.length,
                  maxAffectedRows,
                  previewRows,
                  confirmation: CONFIRM_TEST_DB_UPDATE,
                })}`
              : `【MOCK】\n${formatExecuteResult({
                  tableName: table_name,
                  matchedRows: previewRows.length,
                  affectedRows: previewRows.length,
                  changedRows: previewRows.length,
                  beforeRows: previewRows,
                })}`,
          },
        ],
      };
    }

    if (!shouldDryRun) {
      assertTestDbWriteExecution(confirm_execute, CONFIRM_TEST_DB_UPDATE);
    }

    const where = buildWhereClause(whereEntries);
    const set = buildSetClause(setEntries);
    const connection = await pool.getConnection();

    try {
      if (shouldDryRun) {
        const matchedRows = await getMatchingCount(
          connection,
          table_name,
          where.sql,
          where.params
        );
        if (matchedRows > maxAffectedRows) {
          return safetyError(
            `WHERE 条件匹配 ${matchedRows} 行，超过 max_affected_rows=${maxAffectedRows}，未执行 UPDATE。`
          );
        }
        const previewRows = await getPreviewRows(
          connection,
          table_name,
          where.sql,
          where.params,
          maxAffectedRows
        );
        return {
          content: [
            {
              type: "text",
              text: formatDryRunResult({
                tableName: table_name,
                setValues: set_values,
                whereEquals: where_equals,
                matchedRows,
                maxAffectedRows,
                previewRows,
                confirmation: CONFIRM_TEST_DB_UPDATE,
              }),
            },
          ],
        };
      }

      await connection.query("START TRANSACTION");
      const matchedRows = await getMatchingCount(
        connection,
        table_name,
        where.sql,
        where.params
      );
      if (matchedRows > maxAffectedRows) {
        await rollback(connection);
        return safetyError(
          `WHERE 条件匹配 ${matchedRows} 行，超过 max_affected_rows=${maxAffectedRows}，已回滚，未执行 UPDATE。`
        );
      }

      const beforeRows = await getPreviewRows(
        connection,
        table_name,
        where.sql,
        where.params,
        maxAffectedRows
      );
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE ${quoteIdentifier(table_name)} SET ${set.sql} WHERE ${where.sql} LIMIT ${maxAffectedRows}`,
        [...set.params, ...where.params]
      );
      await connection.query("COMMIT");

      return {
        content: [
          {
            type: "text",
            text: formatExecuteResult({
              tableName: table_name,
              matchedRows,
              affectedRows: result.affectedRows,
              changedRows: result.changedRows,
              beforeRows,
            }),
          },
        ],
      };
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const updateTestDbRowsTool: RegisteredTool<Args> = {
  name: "update_test_db_rows",
  definition: {
    description:
      `更新测试数据库中的少量行（仅 MCP_PROFILE=test 进程注册）。结构化 UPDATE：表名、SET、WHERE 等值条件；默认 dry-run。真执行需 DB_TEST_WRITE_ENABLED=true、本机 3306、dry_run=false、confirm_execute=${CONFIRM_TEST_DB_UPDATE}。`,
    inputSchema: {
      table_name: z.string().describe("表名（仅字母数字下划线）"),
      set_values: z
        .record(DbValueSchema)
        .describe("要更新的字段和值，例如 {\"status\":\"ACTIVE\"}"),
      where_equals: z
        .record(DbValueSchema)
        .describe("WHERE 等值条件，必须非空，例如 {\"user_id\":123}"),
      dry_run: z
        .boolean()
        .optional()
        .describe("默认 true：只预览匹配行和更新内容，不修改数据库"),
      max_affected_rows: z
        .number()
        .int()
        .positive()
        .max(MAX_AFFECTED_ROWS)
        .optional()
        .describe(
          `最多允许影响行数，默认 ${DEFAULT_MAX_AFFECTED_ROWS}，最大 ${MAX_AFFECTED_ROWS}`
        ),
      confirm_execute: z
        .string()
        .optional()
        .describe(
          `真执行时必须填写 ${CONFIRM_TEST_DB_UPDATE}；dry-run 时不需要`
        ),
    },
  },
  handler: wrapToolHandler("update_test_db_rows", handleUpdateTestDbRows),
};
