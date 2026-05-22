import type { z } from "zod";
import type { ToolCallResult } from "../types.js";

export type ToolDefinition = {
  description: string;
  inputSchema: Record<string, z.ZodType>;
};

export type RegisteredTool<TArgs extends Record<string, unknown>> = {
  name: string;
  definition: ToolDefinition;
  handler: (args: TArgs) => Promise<ToolCallResult>;
};
