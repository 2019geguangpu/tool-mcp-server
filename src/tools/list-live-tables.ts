import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { mockListTables } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import { assertSafeTableName } from "../lib/validators.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = { schema?: string };

interface TableNameRow extends RowDataPacket {
  TABLE_NAME: string;
}

function formatTableList(schema: string, tables: string[]): string {
  const header = `【线上表列表】库: ${schema}，共 ${tables.length} 张表\n`;
  if (tables.length === 0) {
    return `${header}（无表）`;
  }
  return `${header}\n${tables.map((t) => `- ${t}`).join("\n")}`;
}

async function handleListLiveTables({
  schema,
}: Args): Promise<ToolCallResult> {
  try {
    const db = schema?.trim() || config.db.database;
    assertSafeTableName(db);

    if (config.mockDbTools) {
      const tables = mockListTables();
      return {
        content: [
          {
            type: "text",
            text: `【MOCK 线上表列表】\n${formatTableList(db, tables)}`,
          },
        ],
      };
    }

    const [rows] = await pool.execute<TableNameRow[]>(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [db]
    );
    const tables = rows.map((r) => r.TABLE_NAME);
    return {
      content: [{ type: "text", text: formatTableList(db, tables) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const listLiveTablesTool: RegisteredTool<Args> = {
  name: "list_live_tables",
  definition: {
    description:
      "列出线上数据库中的全部表名。编写 SQL 或 ORM 前可先调用此工具了解库内有哪些表；默认使用 .env 中的 DB_NAME，也可指定 schema。",
    inputSchema: {
      schema: z
        .string()
        .optional()
        .describe("库名（仅字母数字下划线），省略则用 DB_NAME"),
    },
  },
  handler: wrapToolHandler("list_live_tables", handleListLiveTables),
};
