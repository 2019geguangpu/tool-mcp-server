import {
  ProjectClaimVerificationSchema,
  type ProjectClaimVerification,
  type VerificationStatus,
  type VerificationVerdict,
} from "../schemas/verification.js";

export type ClaimFieldMap = {
  nameColumn: string;
  statusColumn: string;
  deletedAtColumn: string;
};

const NAME_CANDIDATES = ["name", "title", "project_name", "game_name", "work_name"];
const STATUS_CANDIDATES = ["status", "state", "publish_status"];
const DELETED_CANDIDATES = [
  "deleted_at",
  "deletedAt",
  "removed_at",
  "delete_time",
];

function pickColumn(
  row: Record<string, unknown>,
  candidates: string[],
  explicit?: string
): string {
  if (explicit && explicit in row) return explicit;
  for (const key of candidates) {
    if (key in row) return key;
  }
  const lowerKeys = Object.keys(row).map((k) => [k, k.toLowerCase()] as const);
  for (const candidate of candidates) {
    const hit = lowerKeys.find(([, lower]) => lower === candidate.toLowerCase());
    if (hit) return hit[0];
  }
  return candidates[0];
}

export function inferFieldMapFromRows(
  rows: Record<string, unknown>[],
  overrides?: Partial<ClaimFieldMap>
): ClaimFieldMap {
  const sample = rows[0] ?? {};
  return {
    nameColumn: pickColumn(sample, NAME_CANDIDATES, overrides?.nameColumn),
    statusColumn: pickColumn(sample, STATUS_CANDIDATES, overrides?.statusColumn),
    deletedAtColumn: pickColumn(
      sample,
      DELETED_CANDIDATES,
      overrides?.deletedAtColumn
    ),
  };
}

function isDeletedRow(
  row: Record<string, unknown>,
  fieldMap: ClaimFieldMap
): boolean {
  const deletedAt = row[fieldMap.deletedAtColumn];
  if (deletedAt != null && String(deletedAt).trim() !== "") return true;
  const status = String(row[fieldMap.statusColumn] ?? "").toLowerCase();
  return ["deleted", "removed", "trash", "archived"].includes(status);
}

function isDraftRow(
  row: Record<string, unknown>,
  fieldMap: ClaimFieldMap
): boolean {
  const status = String(row[fieldMap.statusColumn] ?? "").toLowerCase();
  return ["draft", "drafts", "private", "wip"].includes(status);
}

function nameMatches(
  row: Record<string, unknown>,
  fieldMap: ClaimFieldMap,
  projectName?: string
): boolean {
  if (!projectName?.trim()) return false;
  const actual = String(row[fieldMap.nameColumn] ?? "").toLowerCase();
  const expected = projectName.trim().toLowerCase();
  return actual === expected || actual.includes(expected) || expected.includes(actual);
}

function verdictToStatus(verdict: VerificationVerdict): VerificationStatus {
  switch (verdict) {
    case "verified":
    case "partially_true":
      return "verified";
    case "refuted":
      return "refuted";
    case "inconclusive":
      return "inconclusive";
  }
}

export function interpretClaimVerification(options: {
  user_id: string;
  project_name?: string;
  claim_summary?: string;
  query_rows: Record<string, unknown>[];
  field_map?: Partial<ClaimFieldMap>;
}): ProjectClaimVerification {
  const { user_id, project_name, claim_summary, query_rows } = options;
  const fieldMap = inferFieldMapFromRows(query_rows, options.field_map);
  const evidence: string[] = [];
  const matched = project_name
    ? query_rows.filter((row) => nameMatches(row, fieldMap, project_name))
    : [];
  const draftProjects = query_rows.filter((row) => isDraftRow(row, fieldMap));
  const activeMatched = matched.filter((row) => !isDeletedRow(row, fieldMap));
  const deletedMatched = matched.filter((row) => isDeletedRow(row, fieldMap));

  let verdict: VerificationVerdict;
  let summary: string;

  if (query_rows.length === 0) {
    verdict = "inconclusive";
    summary = `查询结果为空，无法证实或否定用户主张（UID ${user_id}）。`;
    evidence.push("query_rows 为空");
  } else if (project_name && activeMatched.length > 0) {
    verdict = "refuted";
    summary = `查到「${project_name}」仍存在且未标记删除，与用户「已丢失/被删」主张不符。`;
    evidence.push(`匹配 ${activeMatched.length} 条未删除记录`);
  } else if (project_name && deletedMatched.length > 0) {
    verdict = "verified";
    summary = `查到「${project_name}」存在删除/软删记录，与用户数据丢失主张一致。`;
    evidence.push(`匹配 ${deletedMatched.length} 条已删除记录`);
  } else if (project_name && matched.length === 0) {
    verdict = "partially_true";
    summary = `未找到「${project_name}」，但该 UID 查询返回 ${query_rows.length} 条记录（草稿 ${draftProjects.length} 条），可能更名或记错名称。`;
    evidence.push(`共 ${query_rows.length} 条，无名称匹配`);
    if (draftProjects.length > 0) {
      evidence.push(
        `草稿示例: ${draftProjects
          .slice(0, 3)
          .map((r) => String(r[fieldMap.nameColumn] ?? ""))
          .filter(Boolean)
          .join(", ")}`
      );
    }
  } else {
    verdict = "inconclusive";
    summary = `已返回 ${query_rows.length} 条记录，需结合用户描述人工判断。`;
    evidence.push(`返回 ${query_rows.length} 条记录`);
  }

  if (claim_summary?.trim()) {
    evidence.unshift(`用户主张: ${claim_summary.trim().slice(0, 200)}`);
  }
  evidence.push(
    `字段映射: name=${fieldMap.nameColumn}, status=${fieldMap.statusColumn}, deleted=${fieldMap.deletedAtColumn}`
  );

  return ProjectClaimVerificationSchema.parse({
    user_id,
    project_name,
    verdict,
    verification_status: verdictToStatus(verdict),
    summary,
    evidence,
    matched_projects: matched.slice(0, 10),
    draft_projects: draftProjects.slice(0, 10),
  });
}
