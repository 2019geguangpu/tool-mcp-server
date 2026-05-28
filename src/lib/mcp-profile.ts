export type McpProfile = "test" | "live" | "integrations";

const VALID_PROFILES: McpProfile[] = ["test", "live", "integrations"];

export function parseMcpProfile(raw: string | undefined): McpProfile {
  const value = (raw ?? "integrations").trim().toLowerCase();
  if (value === "full") {
    return "integrations";
  }
  if (VALID_PROFILES.includes(value as McpProfile)) {
    return value as McpProfile;
  }
  throw new Error(
    `无效的 MCP_PROFILE="${raw}"，允许值：test（测试库）、live（线上只读库）、integrations（飞书+CloudWatch）。`
  );
}

/** 各 profile 向 Agent 暴露的工具名（未列入的不注册，避免误用） */
export const TOOLS_BY_PROFILE: Record<McpProfile, readonly string[]> = {
  test: [
    "list_live_tables",
    "get_live_table_schema",
    "evaluate_sql_explain",
    "query_live_select",
    "update_test_db_rows",
  ],
  live: [
    "list_live_tables",
    "get_live_table_schema",
    "evaluate_sql_explain",
    "query_live_select",
  ],
  integrations: [
    "query_biz_core_logs",
    "get_github_hot_repos",
    "search_feishu_notes",
    "read_feishu_doc",
  ],
};

export function isToolAllowedForProfile(
  toolName: string,
  profile: McpProfile
): boolean {
  return TOOLS_BY_PROFILE[profile].includes(toolName);
}
