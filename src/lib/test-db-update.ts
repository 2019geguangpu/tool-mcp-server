import type { RowDataPacket } from "mysql2";
import { config } from "../config.js";

export type DbValue = string | number | boolean | null;

export function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  return value;
}

export function normalizeRows(rows: RowDataPacket[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = normalizeValue(value);
    }
    return normalized;
  });
}

export function formatDryRunResult(args: {
  tableName: string;
  setValues: Record<string, DbValue>;
  whereEquals: Record<string, DbValue>;
  matchedRows: number;
  maxAffectedRows: number;
  previewRows: Record<string, unknown>[];
  confirmation: string;
}): string {
  return [
    "【测试库 UPDATE dry-run】未修改数据库",
    `库: ${config.db.database}`,
    `表: ${args.tableName}`,
    `匹配行数: ${args.matchedRows}`,
    `最大允许影响行数: ${args.maxAffectedRows}`,
    "",
    `SET: ${JSON.stringify(args.setValues, null, 2)}`,
    `WHERE: ${JSON.stringify(args.whereEquals, null, 2)}`,
    "",
    `【将被更新的当前行预览】返回 ${args.previewRows.length} 行`,
    JSON.stringify(args.previewRows, null, 2),
    "",
    `确认无误后，可用 dry_run=false 且 confirm_execute="${args.confirmation}" 真执行。`,
  ].join("\n");
}

export function formatExecuteResult(args: {
  tableName: string;
  matchedRows: number;
  affectedRows: number;
  changedRows: number | undefined;
  beforeRows: Record<string, unknown>[];
}): string {
  return [
    "【测试库 UPDATE 已执行】",
    `库: ${config.db.database}`,
    `表: ${args.tableName}`,
    `匹配行数: ${args.matchedRows}`,
    `affected_rows=${args.affectedRows}`,
    `changed_rows=${args.changedRows ?? "unknown"}`,
    "",
    "【更新前行预览】",
    JSON.stringify(args.beforeRows, null, 2),
  ].join("\n");
}
