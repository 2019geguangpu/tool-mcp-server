import type { InsightsRow } from "./cloudwatch-insights.js";
import type { FeishuSearchHit } from "./feishu-client.js";

export function mockDdl(tableName: string): string {
  return `CREATE TABLE \`${tableName}\` (
  \`id\` bigint NOT NULL AUTO_INCREMENT,
  \`name\` varchar(64) NOT NULL,
  \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
}

export function mockListTables(): string[] {
  return ["users", "orders", "order_items", "products"];
}

export function mockReadonlyRows(): Record<string, unknown>[] {
  return [
    {
      id: 1,
      name: "mock-row-1",
      view_count: 2,
      last_view_at: "2026-05-25T09:25:00.000Z",
    },
    {
      id: 2,
      name: "mock-row-2",
      view_count: 1,
      last_view_at: "2026-05-25T09:20:00.000Z",
    },
  ];
}

export function mockUpdatedRows(): Record<string, unknown>[] {
  return [
    {
      id: 1,
      name: "mock-row-1",
      status: "PENDING",
      updated_at: "2026-05-25T09:25:00.000Z",
    },
  ];
}

export function mockFeishuSearchHits(query: string): FeishuSearchHit[] {
  return [
    {
      title: `【MOCK】笔记：${query}`,
      summary: "这是 mock 摘要，用于本地验证 MCP 工具链。",
      entityType: "DOC",
      docType: "DOCX",
      token: "mock_doc_token_001",
      url: "https://example.feishu.cn/docx/mock_doc_token_001",
      ownerName: "mock-user",
    },
    {
      title: "【MOCK】上线检查清单",
      summary: "发布前核对项…",
      entityType: "DOC",
      docType: "DOCX",
      token: "mock_doc_token_002",
      url: "https://example.feishu.cn/docx/mock_doc_token_002",
    },
  ];
}

export function mockFeishuDocContent(documentId: string): string {
  return [
    `# MOCK 飞书文档 (${documentId})`,
    "",
    "## 章节一",
    "本地 MOCK_FEISHU_TOOLS=true 时不请求飞书 API。",
    "",
    "## 章节二",
    "- 要点 A",
    "- 要点 B",
  ].join("\n");
}

export function mockInsightsRows(queryString: string): InsightsRow[] {
  return [
    {
      "@timestamp": "2026-05-22T07:36:29.490Z",
      "@message": `【MOCK】匹配查询片段: ${queryString.slice(0, 80)}…`,
    },
    {
      "@timestamp": "2026-05-22T07:38:24.621Z",
      "@message":
        '{"level":"error","event":"tool_call_start","toolName":"get_live_table_schema"}',
    },
  ];
}

export const MOCK_EXPLAIN_JSON = JSON.stringify(
  {
    query_block: {
      select_id: 1,
      cost_info: { query_cost: "1.00" },
      table: {
        table_name: "users",
        access_type: "const",
        rows_examined_per_scan: 1,
        filtered: "100.00",
      },
    },
  },
  null,
  2
);
