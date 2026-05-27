const IDENTIFIER_RE = /^[a-zA-Z0-9_]+$/;
const SELECT_ONLY_RE = /^\s*(?:WITH\b[\s\S]*?)?\s*SELECT\b/i;

export function assertSafeIdentifier(value: string, label: string): void {
  if (!value || !IDENTIFIER_RE.test(value)) {
    throw new Error(
      `${label}仅允许字母、数字与下划线，禁止空格或特殊字符。`
    );
  }
}

export function assertSafeTableName(tableName: string): void {
  assertSafeIdentifier(tableName, "表名");
}

export function assertSelectOnly(sql: string, actionLabel = "EXPLAIN"): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!SELECT_ONLY_RE.test(trimmed)) {
    throw new Error(`仅允许对 SELECT 查询执行 ${actionLabel}，禁止 DML/DDL。`);
  }
  return trimmed;
}
