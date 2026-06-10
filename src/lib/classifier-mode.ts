import type { ClassifierMode } from "../agents/types.js";

export function parseClassifierMode(raw: string | undefined): ClassifierMode | undefined {
  if (!raw?.trim()) return undefined;
  const mode = raw.trim().toLowerCase();
  if (mode === "heuristic" || mode === "llm") return mode;
  throw new Error('classifier_mode 仅允许 "heuristic" 或 "llm"。');
}

/** 未显式指定时：有 API Key 默认 llm，否则 heuristic */
export function resolveClassifierMode(
  override: ClassifierMode | undefined,
  hasLlmApiKey: boolean
): ClassifierMode {
  if (override) return override;
  const fromEnv = parseClassifierMode(process.env.CUSTOMER_SERVICE_CLASSIFIER_MODE);
  if (fromEnv) return fromEnv;
  return hasLlmApiKey ? "llm" : "heuristic";
}
