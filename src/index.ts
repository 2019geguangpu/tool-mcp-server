import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { createServer } from "./create-server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  logger.info("server_starting", {
    mockDbTools: config.mockDbTools,
    logDir: config.log.dir,
    auditEnabled: config.audit.enabled,
    auditDir: config.audit.dir,
  });

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("server_ready", {
    transport: "stdio",
    mockDbTools: config.mockDbTools,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error("server_fatal", { message, stack });
  process.exit(1);
});
