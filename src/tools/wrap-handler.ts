import { newCallId, recordToolCall } from "../audit.js";
import { logger } from "../logger.js";
import type { ToolCallResult } from "../types.js";

export function wrapToolHandler<TArgs extends Record<string, unknown>>(
  toolName: string,
  handler: (args: TArgs) => Promise<ToolCallResult>
): (args: TArgs) => Promise<ToolCallResult> {
  return async (args: TArgs) => {
    const callId = newCallId();
    const startedAt = Date.now();

    logger.info("tool_call_start", { callId, toolName, args });

    try {
      const result = await handler(args);
      const durationMs = Date.now() - startedAt;

      logger.info("tool_call_end", {
        callId,
        toolName,
        durationMs,
        isError: Boolean(result.isError),
      });

      await recordToolCall({
        callId,
        toolName,
        args,
        result,
        durationMs,
        startedAt,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);

      logger.error("tool_call_throw", {
        callId,
        toolName,
        durationMs,
        message,
      });

      await recordToolCall({
        callId,
        toolName,
        args,
        durationMs,
        startedAt,
        error,
      });

      throw error;
    }
  };
}
