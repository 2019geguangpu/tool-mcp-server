import { config } from "../config.js";

export const CONFIRM_TEST_DB_UPDATE = "CONFIRM_TEST_DB_UPDATE";
export const CONFIRM_TEST_DB_ALTER = "CONFIRM_TEST_DB_ALTER";

export function isLocalhost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

export function assertTestProfile(toolLabel: string): void {
  if (config.mcpProfile !== "test") {
    throw new Error(
      `${toolLabel} 仅在 MCP_PROFILE=test 的进程中可用（当前为 ${config.mcpProfile}）。请启用 Cursor 中的 db-safety-test。`
    );
  }
}

export function assertTestDbWriteExecution(
  confirmExecute: string | undefined,
  expectedConfirmation: string
): void {
  assertTestProfile("测试库写入工具");
  if (!config.testDbWritesEnabled) {
    throw new Error(
      "真执行需要先在 .env 中设置 DB_TEST_WRITE_ENABLED=true。"
    );
  }
  if (!isLocalhost(config.db.host) || config.db.port !== 3306) {
    throw new Error(
      `测试库写入工具仅允许连接本机 3306，当前为 ${config.db.host}:${config.db.port}。`
    );
  }
  if (confirmExecute !== expectedConfirmation) {
    throw new Error(
      `真执行时 confirm_execute 必须填写 ${expectedConfirmation}。`
    );
  }
}
