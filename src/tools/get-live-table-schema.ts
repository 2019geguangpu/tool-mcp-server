import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { mockDdl } from "../lib/mock.js";
import { toolError } from "../lib/responses.js";
import { assertSafeTableName } from "../lib/validators.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = { table_name: string };

interface ShowCreateRow extends RowDataPacket {
  "Create Table": string;
}

async function handleGetLiveTableSchema({
  table_name,
}: Args): Promise<ToolCallResult> {
  try {
    assertSafeTableName(table_name);
    if (config.mockDbTools) {
      return {
        content: [
          {
            type: "text",
            text: `【MOCK 线上实时 DDL】:\n${mockDdl(table_name)}`,
          },
        ],
      };
    }
    // query 支持 ?? 标识符占位；execute 走预处理语句，?? 会原样下发导致语法错误
    const [rows] = await pool.query<ShowCreateRow[]>(
      "SHOW CREATE TABLE ??",
      [table_name]
    );
    const ddl = rows[0]?.["Create Table"];
    if (!ddl) {
      return toolError(`表 ${table_name} 不存在或无法读取 DDL。`);
    }
    return {
      content: [{ type: "text", text: `【线上实时 DDL】:\n${ddl}` }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolError(message);
  }
}

export const getLiveTableSchemaTool: RegisteredTool<Args> = {
  name: "get_live_table_schema",
  definition: {
    description:
      "在编写、修改数据库相关的 SQL 或 ORM 前，必须调用此工具获取线上真实的表结构，绝对禁止依赖本地 Markdown 文档。",
    inputSchema: {
      table_name: z.string().describe("表名（仅字母数字下划线）"),
    },
  },
  handler: wrapToolHandler("get_live_table_schema", handleGetLiveTableSchema),
};
