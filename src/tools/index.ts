import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { evaluateSqlExplainTool } from "./evaluate-sql-explain.js";
import { getLiveTableSchemaTool } from "./get-live-table-schema.js";
import { listLiveTablesTool } from "./list-live-tables.js";
import { queryBizCoreLogsTool } from "./query-biz-core-logs.js";
import { queryLiveSelectTool } from "./query-live-select.js";
import { readFeishuDocTool } from "./read-feishu-doc.js";
import { searchFeishuNotesTool } from "./search-feishu-notes.js";
import type { RegisteredTool } from "./types.js";
import { updateTestDbRowsTool } from "./update-test-db-rows.js";

const ALL_TOOLS = [
  getLiveTableSchemaTool,
  listLiveTablesTool,
  evaluateSqlExplainTool,
  queryLiveSelectTool,
  updateTestDbRowsTool,
  queryBizCoreLogsTool,
  searchFeishuNotesTool,
  readFeishuDocTool,
] as RegisteredTool<Record<string, unknown>>[];

export function registerTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    server.registerTool(tool.name, tool.definition, tool.handler);
  }
}

export { ALL_TOOLS };
