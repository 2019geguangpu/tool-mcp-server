import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { isToolAllowedForProfile } from "../lib/mcp-profile.js";
import { evaluateSqlExplainTool } from "./evaluate-sql-explain.js";
import { getLiveTableSchemaTool } from "./get-live-table-schema.js";
import { getGithubHotReposTool } from "./get-github-hot-repos.js";
import { listLiveTablesTool } from "./list-live-tables.js";
import { queryBizCoreLogsTool } from "./query-biz-core-logs.js";
import { queryLiveSelectTool } from "./query-live-select";
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
  getGithubHotReposTool,
  searchFeishuNotesTool,
  readFeishuDocTool,
] as RegisteredTool<Record<string, unknown>>[];

export function registerTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    if (!isToolAllowedForProfile(tool.name, config.mcpProfile)) continue;
    server.registerTool(tool.name, tool.definition, tool.handler);
  }
}

export function registeredToolNames(): string[] {
  return ALL_TOOLS.filter((t) =>
    isToolAllowedForProfile(t.name, config.mcpProfile)
  ).map((t) => t.name);
}

export { ALL_TOOLS };
