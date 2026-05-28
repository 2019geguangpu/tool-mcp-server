import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { registerTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name:
      config.mcpProfile === "integrations"
        ? "tool-integrations"
        : `db-safety-mcp-${config.mcpProfile}`,
    version: "1.0.0",
  });
  registerTools(server);
  return server;
}
