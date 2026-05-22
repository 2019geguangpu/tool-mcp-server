import type { ToolCallResult } from "../types.js";

export function toolError(message: string): ToolCallResult {
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
