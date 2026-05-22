const TABLE_NAME_RE = /^[a-zA-Z0-9_]+$/;
const SELECT_ONLY_RE = /^\s*(?:WITH\b[\s\S]*?)?\s*SELECT\b/i;

export function assertSafeTableName(tableName: string): void {
  if (!tableName || !TABLE_NAME_RE.test(tableName)) {
    throw new Error(
      "表名仅允许字母、数字与下划线，禁止空格或特殊字符。"
    );
  }
}

export function assertSelectOnly(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!SELECT_ONLY_RE.test(trimmed)) {
    throw new Error("仅允许对 SELECT 查询执行 EXPLAIN，禁止 DML/DDL。");
  }
  return trimmed;
}
