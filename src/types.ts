export type LogLevel = "debug" | "info" | "warn" | "error";

export type ToolTextContent = {
  type: "text";
  text: string;
};

export type ToolCallResult = {
  content: ToolTextContent[];
  isError?: boolean;
};

export type ToolResultSummary = {
  contentCount: number;
  isError: boolean;
  preview: string;
  textLength: number;
};

export type AuditRecord = {
  callId: string;
  toolName: string;
  startedAt: string;
  durationMs: number;
  args: Record<string, unknown>;
  summary: ToolResultSummary | null;
  error: string | null;
  result: ToolCallResult | null;
};

export type LogFields = Record<string, unknown>;
