import { z } from "zod";
import { config } from "../config.js";
import { paginateContent, normalizeDocumentId } from "../lib/feishu-client.js";
import {
  getFeishuDocumentContent,
  type FeishuDocumentPayload,
} from "../lib/feishu-wiki-sheet.js";
import type { FeishuDownloadedImage } from "../lib/feishu-media.js";
import { mockFeishuDocContent } from "../lib/mock.js";
import type { ToolCallResult, ToolContent } from "../types.js";
import type { RegisteredTool } from "./types.js";
import { wrapToolHandler } from "./wrap-handler.js";

type Args = {
  document_id?: string;
  document_refs?: string[];
  max_chars?: number;
  offset_chars?: number;
};

function resolveDocRefs(args: Args): string[] {
  if (args.document_refs?.length) {
    const refs = args.document_refs.map((r) => r.trim()).filter(Boolean);
    if (refs.length === 0) {
      throw new Error("document_refs 中无有效飞书链接或 document_id。");
    }
    return refs;
  }
  if (args.document_id?.trim()) {
    return [args.document_id.trim()];
  }
  throw new Error(
    "请把用户在对话里粘贴的飞书链接填入 document_refs（可多篇），或单篇用 document_id。"
  );
}

function imagesToToolContent(images: FeishuDownloadedImage[]): ToolContent[] {
  return images.map((img) => ({
    type: "image" as const,
    data: img.base64,
    mimeType: img.mimeType,
  }));
}

type ReadOneDocResult = {
  textSection: string;
  images: FeishuDownloadedImage[];
};

async function readOneDoc(
  ref: string,
  limit: number,
  offset: number,
  sourceLabel: string
): Promise<ReadOneDocResult> {
  const displayId = normalizeDocumentId(ref) || ref;
  const includeImages = offset === 0;

  if (config.feishu.mockFeishuTools) {
    const content = mockFeishuDocContent(displayId);
    const { textResult, totalChars, nextOffset } = paginateContent(
      content,
      limit,
      offset
    );
    return {
      textSection: [
        `--- ${sourceLabel} (${displayId}) ---`,
        `字数: ${totalChars}${textResult.truncated ? `（分页中）` : ""}`,
        nextOffset != null ? `续读: offset_chars=${nextOffset}` : "",
        "",
        textResult.text,
      ]
        .filter(Boolean)
        .join("\n"),
      images: [],
    };
  }

  const payload: FeishuDocumentPayload = await getFeishuDocumentContent(ref, {
    includeImages,
  });
  const { textResult, totalChars, nextOffset } = paginateContent(
    payload.text,
    limit,
    offset
  );

  const header = [
    `--- ${sourceLabel} (${displayId}) ---`,
    `字数: ${totalChars}${textResult.truncated ? `（本页，见文末续读提示）` : offset > 0 ? `（本页至文末）` : ""}`,
    includeImages && payload.images.length > 0
      ? `图片: ${payload.images.length} 张（见下方 image 块与本地路径）`
      : !includeImages && offset > 0
        ? "（分页续读，图片已在首页返回）"
        : "",
    nextOffset != null ? `续读: offset_chars=${nextOffset}` : "",
  ].filter(Boolean);

  if (payload.imageWarnings.length > 0) {
    header.push(
      `图片告警: ${payload.imageWarnings.slice(0, 5).join("; ")}${payload.imageWarnings.length > 5 ? "…" : ""}`
    );
  }

  return {
    textSection: [...header, "", textResult.text || "（文档为空或无可提取纯文本）"].join(
      "\n"
    ),
    images: includeImages ? payload.images : [],
  };
}

async function handleReadFeishuDoc(args: Args): Promise<ToolCallResult> {
  try {
    const refs = resolveDocRefs(args);
    const limit = args.max_chars ?? config.feishu.maxDocChars;
    const offset = Math.max(0, args.offset_chars ?? 0);

    const sections: string[] = [
      `【飞书文档正文】用户指定的 ${refs.length} 篇`,
      offset > 0
        ? `（分页偏移 offset_chars=${offset}）`
        : "（仅读取对话中的链接，未搜索其它文档；含表格截图）",
      "",
    ];
    const errors: string[] = [];
    const allImages: FeishuDownloadedImage[] = [];

    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]!;
      const displayId = normalizeDocumentId(ref) || ref;
      const label = `文档 ${i + 1}/${refs.length}`;
      try {
        const { textSection, images } = await readOneDoc(
          ref,
          limit,
          offset,
          label
        );
        sections.push(textSection, "");
        allImages.push(...images);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${label} (${displayId}): ${message}`);
        sections.push(`--- ${label} (${displayId}) ---`, `【读取失败】${message}`, "");
      }
    }

    if (errors.length === refs.length) {
      return {
        content: [
          {
            type: "text",
            text: [
              sections.join("\n"),
              "【全部失败】",
              ...errors,
              "",
              "排查: FEISHU_APP_ID/SECRET；文档已「添加文档应用」；wiki/sheets 读图需 docs:document.media:download 或 drive:drive:readonly。",
            ].join("\n"),
          },
        ],
        isError: true,
      };
    }

    if (errors.length > 0) {
      sections.push("【部分失败】", ...errors);
    }

    const content: ToolContent[] = [
      { type: "text", text: sections.join("\n").trimEnd() },
      ...imagesToToolContent(allImages),
    ];

    return { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: [
            "【飞书文档读取异常】",
            message,
            "",
            "从用户当前消息复制飞书链接，填入 document_refs；超长文档用 offset_chars 分页续读。",
          ].join("\n"),
        },
      ],
      isError: true,
    };
  }
}

export const readFeishuDocTool: RegisteredTool<Args> = {
  name: "read_feishu_doc",
  definition: {
    description:
      "读取飞书云文档正文与图片（docx / wiki 表格）。粘贴链接到 document_refs。表格截图通过浮动图片 API 下载，并以 image 块 + logs/feishu-media/ 路径返回。超长用 offset_chars 分页（续页不重复下图）。",
    inputSchema: {
      document_refs: z
        .array(z.string())
        .optional()
        .describe(
          "用户在当前对话消息里给出的一个或多个飞书 docx/docs/wiki 链接（从输入框复制，不要改写成搜索）"
        ),
      document_id: z
        .string()
        .optional()
        .describe("仅一篇时可直接传单个链接或 document_id"),
      max_chars: z
        .number()
        .optional()
        .describe(
          `每页最大返回字符数，默认 ${config.feishu.maxDocChars}`
        ),
      offset_chars: z
        .number()
        .optional()
        .describe(
          "分页偏移（字符），从该位置继续读；上次返回中的「续读: offset_chars=N」即下一页起点，默认 0"
        ),
    },
  },
  handler: wrapToolHandler("read_feishu_doc", handleReadFeishuDoc),
};
