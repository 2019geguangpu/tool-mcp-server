import { assertSafeTableName } from "./validators.js";

const ALTER_TABLE_START = /^\s*ALTER\s+TABLE\s+/i;

const FORBIDDEN_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /\bDROP\s+DATABASE\b/i, message: "禁止 DROP DATABASE。" },
  { re: /\bDROP\s+TABLE\b/i, message: "禁止 DROP TABLE，本工具仅用于 ALTER TABLE。" },
  { re: /\bTRUNCATE\b/i, message: "禁止 TRUNCATE。" },
  { re: /\bCREATE\s+DATABASE\b/i, message: "禁止 CREATE DATABASE。" },
  { re: /\bCREATE\s+TABLE\b/i, message: "禁止 CREATE TABLE。" },
  { re: /\bRENAME\s+TABLE\b/i, message: "禁止 RENAME TABLE，请使用 ALTER TABLE … RENAME。" },
  { re: /\bINSERT\b/i, message: "禁止 INSERT。" },
  { re: /\bUPDATE\b/i, message: "禁止 UPDATE。" },
  { re: /\bDELETE\b/i, message: "禁止 DELETE。" },
  { re: /\bREPLACE\b/i, message: "禁止 REPLACE。" },
  { re: /\bGRANT\b/i, message: "禁止 GRANT。" },
  { re: /\bREVOKE\b/i, message: "禁止 REVOKE。" },
  { re: /\bCALL\b/i, message: "禁止 CALL。" },
  { re: /\bLOAD\s+DATA\b/i, message: "禁止 LOAD DATA。" },
  { re: /\bINTO\s+OUTFILE\b/i, message: "禁止 INTO OUTFILE。" },
  { re: /\bINTO\s+DUMPFILE\b/i, message: "禁止 INTO DUMPFILE。" },
];

export function normalizeAlterTableSql(sql: string): string {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("alter_sql 不能为空。");
  }
  if (!ALTER_TABLE_START.test(trimmed)) {
    throw new Error("仅允许单条 ALTER TABLE 语句。");
  }
  const normalized = trimmed.replace(/;+\s*$/, "");
  if (/;/.test(normalized)) {
    throw new Error("禁止多条 SQL 或语句内分号。");
  }
  if (/--|\/\*/.test(normalized)) {
    throw new Error("禁止 SQL 注释（避免绕过校验）。");
  }
  for (const { re, message } of FORBIDDEN_PATTERNS) {
    if (re.test(normalized)) {
      throw new Error(message);
    }
  }
  return normalized;
}

export function parseAlterTableName(sql: string): string {
  const match = sql.match(
    /^\s*ALTER\s+TABLE\s+(?:`([^`]+)`|([a-zA-Z0-9_]+))/i
  );
  const tableName = match?.[1] ?? match?.[2];
  if (!tableName) {
    throw new Error("无法从 ALTER TABLE 语句中解析表名。");
  }
  assertSafeTableName(tableName);
  return tableName;
}
