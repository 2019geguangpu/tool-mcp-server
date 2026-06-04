import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import {
  normalizeAlterTableSql,
  parseAlterTableName,
} from "../lib/alter-table-sql.js";
import { mockDdl } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import {
  assertTestDbWriteExecution,
  assertTestProfile,
  CONFIRM_TEST_DB_ALTER,
} from "../lib/test-db-write-guard.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  alter_sql: string;
  dry_run?: boolean;
  confirm_execute?: string;
};

interface ShowCreateRow extends RowDataPacket {
  Table: string;
  "Create Table": string;
}

async function fetchTableDdl(tableName: string): Promise<string | null> {
  const [rows] = await pool.query<ShowCreateRow[]>(
    "SHOW CREATE TABLE ??",
    [tableName]
  );
  return rows[0]?.["Create Table"] ?? null;
}

function formatDryRunResult(args: {
  tableName: string;
  alterSql: string;
  beforeDdl: string | null;
}): string {
  const lines = [
    "【测试库 ALTER TABLE dry-run】未修改数据库",
    `库: ${config.db.database}`,
    `表: ${args.tableName}`,
    "",
    "【将执行的语句】",
    args.alterSql,
  ];
  if (args.beforeDdl) {
    lines.push("", "【当前表 DDL】", args.beforeDdl);
  }
  lines.push(
    "",
    `确认无误后，可用 dry_run=false 且 confirm_execute="${CONFIRM_TEST_DB_ALTER}" 真执行。`
  );
  return lines.join("\n");
}

function formatExecuteResult(args: {
  tableName: string;
  alterSql: string;
  beforeDdl: string | null;
  afterDdl: string | null;
}): string {
  const lines = [
    "【测试库 ALTER TABLE 已执行】",
    `库: ${config.db.database}`,
    `表: ${args.tableName}`,
    "",
    "【已执行语句】",
    args.alterSql,
  ];
  if (args.beforeDdl) {
    lines.push("", "【变更前 DDL】", args.beforeDdl);
  }
  if (args.afterDdl) {
    lines.push("", "【变更后 DDL】", args.afterDdl);
  }
  return lines.join("\n");
}

async function handleAlterTestTable({
  alter_sql,
  dry_run,
  confirm_execute,
}: Args): Promise<ToolCallResult> {
  try {
    assertTestProfile("alter_test_table");
    const alterSql = normalizeAlterTableSql(alter_sql);
    const tableName = parseAlterTableName(alterSql);
    const shouldDryRun = dry_run !== false;

    if (config.mockDbTools) {
      const ddl = mockDdl(tableName);
      return {
        content: [
          {
            type: "text",
            text: shouldDryRun
              ? `【MOCK】\n${formatDryRunResult({
                  tableName,
                  alterSql,
                  beforeDdl: ddl,
                })}`
              : `【MOCK】\n${formatExecuteResult({
                  tableName,
                  alterSql,
                  beforeDdl: ddl,
                  afterDdl: `${ddl}\n-- mock: applied alter`,
                })}`,
          },
        ],
      };
    }

    if (!shouldDryRun) {
      assertTestDbWriteExecution(confirm_execute, CONFIRM_TEST_DB_ALTER);
    }

    const beforeDdl = await fetchTableDdl(tableName);
    if (!beforeDdl) {
      return toolError(`表 ${tableName} 不存在或无法读取 DDL。`);
    }

    if (shouldDryRun) {
      return {
        content: [
          {
            type: "text",
            text: formatDryRunResult({ tableName, alterSql, beforeDdl }),
          },
        ],
      };
    }

    await pool.query(alterSql);
    const afterDdl = await fetchTableDdl(tableName);

    return {
      content: [
        {
          type: "text",
          text: formatExecuteResult({
            tableName,
            alterSql,
            beforeDdl,
            afterDdl,
          }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const alterTestTableTool: RegisteredTool<Args> = {
  name: "alter_test_table",
  definition: {
    description:
      "在测试库执行单条 ALTER TABLE（仅 MCP_PROFILE=test 进程注册）。默认 dry-run 仅预览语句与当前 DDL；真执行需 DB_TEST_WRITE_ENABLED=true、本机 3306、dry_run=false、confirm_execute=CONFIRM_TEST_DB_ALTER。禁止 DROP TABLE、TRUNCATE 等非 ALTER 语句。",
    inputSchema: {
      alter_sql: z
        .string()
        .describe(
          '单条 ALTER TABLE 语句，例如 ALTER TABLE users ADD COLUMN nickname VARCHAR(64) NULL'
        ),
      dry_run: z
        .boolean()
        .optional()
        .describe("默认 true：校验语句并展示当前 DDL，不修改数据库"),
      confirm_execute: z
        .string()
        .optional()
        .describe(
          `真执行时必须填写 ${CONFIRM_TEST_DB_ALTER}；dry-run 时不需要`
        ),
    },
  },
  handler: wrapToolHandler("alter_test_table", handleAlterTestTable),
};
