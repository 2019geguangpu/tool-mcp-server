import { z } from "zod";
import { config } from "../config.js";
import {
  searchFeishuDocs,
  type FeishuSearchHit,
} from "../lib/feishu-client.js";
import { mockFeishuSearchHits } from "../lib/mock.js";
import type { ToolCallResult } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  query: string;
  page_size?: number;
  page_token?: string;
};

function formatHits(
  query: string,
  hits: FeishuSearchHit[],
  meta: { total: number; hasMore: boolean; pageToken?: string }
): string {
  const lines = [
    "【飞书笔记搜索】",
    `关键词: ${query}`,
    `命中: ${meta.total}（本页 ${hits.length} 条）`,
    meta.hasMore ? "还有更多结果，可传 page_token 翻页" : "",
    meta.pageToken ? `page_token: ${meta.pageToken}` : "",
    "",
  ].filter(Boolean);

  if (hits.length === 0) {
    lines.push("（无匹配文档）");
    return lines.join("\n");
  }

  for (const [i, hit] of hits.entries()) {
    lines.push(
      `${i + 1}. ${hit.title || "（无标题）"}`,
      `   类型: ${hit.entityType}/${hit.docType}  token: ${hit.token}`,
      hit.url ? `   链接: ${hit.url}` : "",
      hit.summary ? `   摘要: ${hit.summary}` : "",
      hit.ownerName ? `   所有者: ${hit.ownerName}` : "",
      ""
    );
  }

  lines.push(
    "下一步: 用 read_feishu_doc 传入 token 或文档链接读取全文。"
  );
  return lines.filter((l) => l !== undefined).join("\n");
}

async function handleSearchFeishuNotes({
  query,
  page_size,
  page_token,
}: Args): Promise<ToolCallResult> {
  try {
    const q = query.trim();
    if (!q) {
      return {
        content: [{ type: "text", text: "【飞书搜索】query 不能为空。" }],
        isError: true,
      };
    }

    if (config.feishu.mockFeishuTools) {
      const hits = mockFeishuSearchHits(q);
      return {
        content: [
          {
            type: "text",
            text: formatHits(q, hits, {
              total: hits.length,
              hasMore: false,
            }).replace("【飞书笔记搜索】", "【MOCK 飞书笔记搜索】"),
          },
        ],
      };
    }

    const pageSize = page_size ?? config.feishu.searchPageSize;
    if (pageSize < 1 || pageSize > 20) {
      return {
        content: [{ type: "text", text: "【飞书搜索】page_size 须在 1～20 之间。" }],
        isError: true,
      };
    }

    const { hits, total, hasMore, pageToken } = await searchFeishuDocs({
      query: q,
      pageSize,
      pageToken: page_token,
    });

    return {
      content: [
        {
          type: "text",
          text: formatHits(q, hits, { total, hasMore, pageToken }),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: [
            "【飞书搜索异常】",
            message,
            "",
            "排查: 应用已开通 search:docs:read；FEISHU_USER_ACCESS_TOKEN 有效；",
            "可选 FEISHU_NOTES_FOLDER_TOKENS 限定笔记目录。",
          ].join("\n"),
        },
      ],
      isError: true,
    };
  }
}

export const searchFeishuNotesTool: RegisteredTool<Args> = {
  name: "search_feishu_notes",
  definition: {
    description:
      "在飞书云文档中按关键词搜索笔记。禁止调用：用户已在 Cursor 对话里粘贴了飞书文档链接（应改用 read_feishu_doc，把链接填入 document_refs）。仅在用户未提供任何链接、且需要按关键词在全库找笔记时使用。需要 FEISHU_USER_ACCESS_TOKEN。",
    inputSchema: {
      query: z
        .string()
        .describe("搜索关键词，最长 50 字符，例如「Redis 缓存」「上线 checklist」"),
      page_size: z
        .number()
        .optional()
        .describe("每页条数，1～20，默认 10"),
      page_token: z
        .string()
        .optional()
        .describe("上一页返回的分页标记"),
    },
  },
  handler: wrapToolHandler("search_feishu_notes", handleSearchFeishuNotes),
};
