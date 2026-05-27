export type ExplainSummary = {
  rawJson: string;
  queryCost: number | null;
  estimatedRowsExamined: number;
  maxFullScanRows: number;
  hasFilesort: boolean;
  accessTypes: string[];
  tableNames: string[];
};

export type AnalyzeSummary = {
  rawText: string;
  maxActualTimeMs: number | null;
};

export const MAX_EXPLAIN_QUERY_COST = 1000;
export const MAX_EXPLAIN_ROWS_EXAMINED = 100_000;
export const MAX_EXPLAIN_FULL_SCAN_ROWS = 10_000;
export const MAX_ANALYZE_MS = 1000;
export const MAX_SELECT_MS = 1000;

const MAX_PLAN_TEXT_CHARS = 12_000;

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function summarizeExplainJson(rawJson: string): ExplainSummary {
  const parsed = JSON.parse(rawJson) as unknown;
  let queryCost: number | null = null;
  let estimatedRowsExamined = 0;
  let maxFullScanRows = 0;
  let hasFilesort = false;
  const accessTypes = new Set<string>();
  const tableNames = new Set<string>();

  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    const record = value as Record<string, unknown>;
    const costInfo = record.cost_info as Record<string, unknown> | undefined;
    const currentCost = parseNumber(costInfo?.query_cost);
    if (currentCost !== null) {
      queryCost = Math.max(queryCost ?? 0, currentCost);
    }

    const tableName = record.table_name;
    if (typeof tableName === "string") tableNames.add(tableName);

    const accessType = record.access_type;
    if (typeof accessType === "string") accessTypes.add(accessType);

    const rowsExamined = parseNumber(record.rows_examined_per_scan);
    if (rowsExamined !== null) {
      estimatedRowsExamined += rowsExamined;
      if (accessType === "ALL") {
        maxFullScanRows = Math.max(maxFullScanRows, rowsExamined);
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (key.toLowerCase().includes("filesort")) hasFilesort = true;
      visit(child);
    }
  }

  visit(parsed);
  return {
    rawJson,
    queryCost,
    estimatedRowsExamined,
    maxFullScanRows,
    hasFilesort,
    accessTypes: [...accessTypes],
    tableNames: [...tableNames],
  };
}

export function evaluateExplain(summary: ExplainSummary): string[] {
  const reasons: string[] = [];
  if (
    summary.queryCost !== null &&
    summary.queryCost > MAX_EXPLAIN_QUERY_COST
  ) {
    reasons.push(
      `query_cost=${summary.queryCost} 超过阈值 ${MAX_EXPLAIN_QUERY_COST}`
    );
  }
  if (summary.estimatedRowsExamined > MAX_EXPLAIN_ROWS_EXAMINED) {
    reasons.push(
      `预估扫描行数=${summary.estimatedRowsExamined} 超过阈值 ${MAX_EXPLAIN_ROWS_EXAMINED}`
    );
  }
  if (summary.maxFullScanRows > MAX_EXPLAIN_FULL_SCAN_ROWS) {
    reasons.push(
      `最大全表扫描行数=${summary.maxFullScanRows} 超过阈值 ${MAX_EXPLAIN_FULL_SCAN_ROWS}`
    );
  }
  return reasons;
}

export function summarizeAnalyzeOutput(rawText: string): AnalyzeSummary {
  const actualTimeRe =
    /actual time=(\d+(?:\.\d+)?)\.\.(\d+(?:\.\d+)?)/gi;
  let maxActualTimeMs: number | null = null;

  for (const match of rawText.matchAll(actualTimeRe)) {
    const endTime = Number(match[2]);
    if (Number.isFinite(endTime)) {
      maxActualTimeMs = Math.max(maxActualTimeMs ?? 0, endTime);
    }
  }

  return { rawText, maxActualTimeMs };
}

export function truncatePlanText(text: string): string {
  if (text.length <= MAX_PLAN_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_PLAN_TEXT_CHARS)}\n...（已截断，原始长度 ${text.length} 字符）`;
}

export function formatExplainSummary(summary: ExplainSummary): string {
  return [
    `query_cost=${summary.queryCost ?? "unknown"}`,
    `estimated_rows_examined=${summary.estimatedRowsExamined}`,
    `max_full_scan_rows=${summary.maxFullScanRows}`,
    `has_filesort=${summary.hasFilesort ? "yes" : "no"}`,
    `access_types=${summary.accessTypes.join(",") || "unknown"}`,
    `tables=${summary.tableNames.join(",") || "unknown"}`,
  ].join("\n");
}

export function buildExplainRejectedMessage(
  reasons: string[],
  summary: ExplainSummary
): string {
  return [
    "EXPLAIN FORMAT=JSON 预估未通过，未执行 EXPLAIN ANALYZE / SELECT。",
    "",
    "原因:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "阈值:",
    `- query_cost <= ${MAX_EXPLAIN_QUERY_COST}`,
    `- 预估扫描行数 <= ${MAX_EXPLAIN_ROWS_EXAMINED}`,
    `- 最大全表扫描行数 <= ${MAX_EXPLAIN_FULL_SCAN_ROWS}`,
    "",
    "实际指标:",
    formatExplainSummary(summary),
    "",
    "执行计划 JSON:",
    truncatePlanText(summary.rawJson),
  ].join("\n");
}

export function buildAnalyzeParseRejectedMessage(
  summary: AnalyzeSummary
): string {
  return [
    "EXPLAIN ANALYZE 未解析到 actual time，未执行 SELECT。",
    "",
    "EXPLAIN ANALYZE 输出:",
    truncatePlanText(summary.rawText),
  ].join("\n");
}

export function buildAnalyzeRejectedMessage(
  explainSummary: ExplainSummary,
  analyzeSummary: AnalyzeSummary
): string {
  return [
    "EXPLAIN ANALYZE 实测耗时未通过，未执行 SELECT。",
    "",
    `原因: actual_time_ms=${analyzeSummary.maxActualTimeMs} 超过阈值 ${MAX_ANALYZE_MS}`,
    "",
    "EXPLAIN 指标:",
    formatExplainSummary(explainSummary),
    "",
    "EXPLAIN ANALYZE 输出:",
    truncatePlanText(analyzeSummary.rawText),
  ].join("\n");
}
