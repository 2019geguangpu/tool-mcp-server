import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import mysql from "mysql2/promise";
import { z } from "zod";
import "dotenv/config";

const TABLE_NAME_RE = /^[a-zA-Z0-9_]+$/;
const SELECT_ONLY_RE = /^\s*(?:WITH\b[\s\S]*?)?\s*SELECT\b/i;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3906),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "test",
  waitForConnections: true,
  connectionLimit: 10,
});

function assertSafeTableName(tableName) {
  if (!tableName || !TABLE_NAME_RE.test(tableName)) {
    throw new Error(
      "表名仅允许字母、数字与下划线，禁止空格或特殊字符。"
    );
  }
}

function assertSelectOnly(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!SELECT_ONLY_RE.test(trimmed)) {
    throw new Error("仅允许对 SELECT 查询执行 EXPLAIN，禁止 DML/DDL。");
  }
  return trimmed;
}

function toolError(message) {
  return {
    content: [
      {
        type: "text",
        text: `【数据库执行异常】:\n${message}\n请检查你的表名或 SQL 语法。`,
      },
    ],
    isError: true,
  };
}

const server = new McpServer({
  name: "db-safety-mcp",
  version: "1.0.0",
});

server.registerTool(
  "get_live_table_schema",
  {
    description:
      "在编写、修改数据库相关的 SQL 或 ORM 前，必须调用此工具获取线上真实的表结构，绝对禁止依赖本地 Markdown 文档。",
    inputSchema: {
      table_name: z.string().describe("表名（仅字母数字下划线）"),
    },
  },
  async ({ table_name }) => {
    try {
      assertSafeTableName(table_name);
      const [rows] = await pool.execute("SHOW CREATE TABLE ??", [
        table_name,
      ]);
      const ddl = rows[0]["Create Table"];
      return {
        content: [{ type: "text", text: `【线上实时 DDL】:\n${ddl}` }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolError(message);
    }
  }
);

server.registerTool(
  "evaluate_sql_explain",
  {
    description:
      "在生成新的 SELECT 查询，或修改表索引前，必须调用此工具对 SQL 进行 EXPLAIN 效率评估。",
    inputSchema: {
      sql_query: z.string().describe("需要评估的完整 SELECT SQL"),
    },
  },
  async ({ sql_query }) => {
    try {
      const sql = assertSelectOnly(sql_query);
      const [rows] = await pool.query(`EXPLAIN FORMAT=JSON ${sql}`);
      const jsonPlan = Object.values(rows[0])[0];
      return {
        content: [
          {
            type: "text",
            text: `【执行计划 JSON】:\n${jsonPlan}\n\n请分析此计划的 query_cost、扫表行数及是否发生 filesort。`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toolError(message);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Database Safety MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
