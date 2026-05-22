import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { evaluateSqlExplainTool } from "./evaluate-sql-explain.js";
import { getLiveTableSchemaTool } from "./get-live-table-schema.js";
import type { RegisteredTool } from "./types.js";

const ALL_TOOLS: RegisteredTool<Record<string, unknown>>[] = [
  getLiveTableSchemaTool,
  evaluateSqlExplainTool,
];

export function registerTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    server.registerTool(tool.name, tool.definition, tool.handler);
  }
}

export { ALL_TOOLS };
