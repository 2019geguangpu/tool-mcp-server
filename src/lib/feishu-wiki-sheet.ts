import { feishuApiJson, getTenantAccessToken, normalizeDocumentId } from "./feishu-client.js";
import {
  downloadDocxImages,
  formatDocxImageAppendix,
} from "./feishu-docx-images.js";
import type { FeishuDownloadedImage } from "./feishu-media.js";
import {
  downloadSheetImages,
  formatImageAppendix,
  formatRawSheetValues,
} from "./feishu-sheet-images.js";

type WikiNode = {
  obj_token: string;
  obj_type: string;
  title?: string;
};

export type FeishuDocumentPayload = {
  text: string;
  images: FeishuDownloadedImage[];
  imageWarnings: string[];
};

export type GetFeishuContentOptions = {
  /** 分页续读时跳过图片下载（offset > 0） */
  includeImages?: boolean;
};

export function parseSheetIdFromUrl(url: string): string | null {
  const m = url.trim().match(/[?&]sheet=([A-Za-z0-9]+)/);
  return m?.[1] ?? null;
}

export function isWikiSource(source: string): boolean {
  return /\/wiki\//.test(source.trim());
}

export function isSheetSource(source: string): boolean {
  return /\/sheets\//.test(source.trim());
}

async function getWikiNode(nodeToken: string): Promise<WikiNode> {
  const token = await getTenantAccessToken();
  const data = await feishuApiJson<{
    node?: {
      obj_token?: string;
      obj_type?: string;
      title?: string;
    };
  }>(
    `/wiki/v2/spaces/get_node?token=${encodeURIComponent(nodeToken)}`,
    { method: "GET", token }
  );
  const node = data.node;
  if (!node?.obj_token || !node.obj_type) {
    throw new Error("无法解析知识库节点（缺少 obj_token / obj_type）。");
  }
  return {
    obj_token: node.obj_token,
    obj_type: node.obj_type,
    title: node.title,
  };
}

async function listSheetIds(spreadsheetToken: string): Promise<
  Array<{ sheet_id: string; title?: string }>
> {
  const token = await getTenantAccessToken();
  const data = await feishuApiJson<{
    sheets?: Array<{ sheet_id?: string; title?: string }>;
  }>(
    `/sheets/v3/spreadsheets/${encodeURIComponent(spreadsheetToken)}/sheets/query`,
    { method: "GET", token }
  );
  return (data.sheets ?? [])
    .filter((s): s is { sheet_id: string; title?: string } => Boolean(s.sheet_id))
    .map((s) => ({ sheet_id: s.sheet_id!, title: s.title }));
}

async function readSheetRangeRaw(
  spreadsheetToken: string,
  sheetId: string
): Promise<unknown[][]> {
  const token = await getTenantAccessToken();
  const range = encodeURIComponent(`${sheetId}!A1:ZZ2000`);
  const data = await feishuApiJson<{
    valueRange?: { values?: unknown[][] };
  }>(
    `/sheets/v2/spreadsheets/${encodeURIComponent(spreadsheetToken)}/values/${range}`,
    { method: "GET", token }
  );
  return data.valueRange?.values ?? [];
}

function isCellEmpty(cell: unknown): boolean {
  return cell == null || String(cell).trim() === "";
}

/** 去掉每行尾部空列，以及表格底部空行 */
export function trimSheetValues(values: string[][]): string[][] {
  if (values.length === 0) return values;

  let lastRow = values.length - 1;
  while (lastRow >= 0 && values[lastRow]!.every(isCellEmpty)) {
    lastRow--;
  }
  const rows = values.slice(0, lastRow + 1);
  if (rows.length === 0) return [];

  let maxCol = 0;
  for (const row of rows) {
    for (let c = row.length - 1; c >= 0; c--) {
      if (!isCellEmpty(row[c])) {
        maxCol = Math.max(maxCol, c + 1);
        break;
      }
    }
  }

  return rows.map((row) =>
    row.slice(0, maxCol).map((c) => (c == null ? "" : String(c)))
  );
}

function formatSheetValues(
  values: string[][],
  meta: { title?: string; sheetTitle?: string; sheetId: string }
): string {
  const lines: string[] = [];
  if (meta.title) lines.push(`# ${meta.title}`, "");
  lines.push(
    `类型: 电子表格 | sheet_id: ${meta.sheetId}${meta.sheetTitle ? ` | 工作表: ${meta.sheetTitle}` : ""}`,
    ""
  );
  if (values.length === 0) {
    lines.push("（该工作表无数据或范围为空）");
    return lines.join("\n");
  }
  for (const row of values) {
    lines.push(row.join("\t"));
  }
  return lines.join("\n");
}

async function getSheetDocumentPayload(
  spreadsheetToken: string,
  source: string,
  docTitle?: string,
  includeImages = true
): Promise<FeishuDocumentPayload> {
  const preferredSheetId = parseSheetIdFromUrl(source);
  const sheets = await listSheetIds(spreadsheetToken);
  if (sheets.length === 0) {
    throw new Error("电子表格无工作表。");
  }

  const targets = preferredSheetId
    ? sheets.filter((s) => s.sheet_id === preferredSheetId)
    : sheets;
  if (preferredSheetId && targets.length === 0) {
    throw new Error(`未找到工作表 sheet_id=${preferredSheetId}。`);
  }

  const parts: string[] = [];
  const allImages: FeishuDownloadedImage[] = [];
  const allWarnings: string[] = [];

  for (let si = 0; si < targets.length; si++) {
    const sheet = targets[si]!;
    const raw = await readSheetRangeRaw(spreadsheetToken, sheet.sheet_id);
    let imageByToken = new Map<string, FeishuDownloadedImage>();

    if (includeImages) {
      const { images, warnings } = await downloadSheetImages({
        spreadsheetToken,
        sheetId: sheet.sheet_id,
        sheetTitle: sheet.title,
        idPrefix: targets.length > 1 ? `s${si + 1}-img-` : "img-",
        rawValues: raw,
      });
      allImages.push(...images);
      allWarnings.push(...warnings);
      imageByToken = new Map(images.map((img) => [img.fileToken, img]));
    }

    let values = trimSheetValues(formatRawSheetValues(raw, imageByToken));

    parts.push(
      formatSheetValues(values, {
        title: parts.length === 0 ? docTitle : undefined,
        sheetTitle: sheet.title,
        sheetId: sheet.sheet_id,
      })
    );
  }

  if (includeImages && allImages.length > 0) {
    parts.push(formatImageAppendix(allImages));
  }
  if (allWarnings.length > 0) {
    parts.push(["", "## 图片下载告警", ...allWarnings.map((w) => `- ${w}`)].join("\n"));
  }

  return {
    text: parts.join("\n\n---\n\n"),
    images: allImages,
    imageWarnings: allWarnings,
  };
}

async function getDocxPayload(
  documentId: string,
  includeImages: boolean
): Promise<FeishuDocumentPayload> {
  const token = await getTenantAccessToken();
  const data = await feishuApiJson<{ content?: string }>(
    `/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`,
    { method: "GET", token }
  );
  const images = includeImages ? await downloadDocxImages(documentId) : [];
  const appendix = includeImages ? formatDocxImageAppendix(images) : "";
  return {
    text: (data.content ?? "") + appendix,
    images,
    imageWarnings: [],
  };
}

/** 按链接/ID 读取飞书云文档（wiki 节点会先解析为真实 obj_token） */
export async function getFeishuDocumentContent(
  source: string,
  options: GetFeishuContentOptions = {}
): Promise<FeishuDocumentPayload> {
  const includeImages = options.includeImages !== false;
  const trimmed = source.trim();
  let objToken = normalizeDocumentId(trimmed);
  let objType: string | undefined;
  let title: string | undefined;

  if (isWikiSource(trimmed)) {
    const node = await getWikiNode(objToken);
    objToken = node.obj_token;
    objType = node.obj_type;
    title = node.title;
  } else if (isSheetSource(trimmed)) {
    objType = "sheet";
  }

  if (objType === "sheet") {
    return getSheetDocumentPayload(objToken, trimmed, title, includeImages);
  }

  if (objType && objType !== "docx" && objType !== "doc") {
    throw new Error(
      `暂不支持的文档类型「${objType}」，当前支持 docx/doc 与 sheet（含 wiki 中的表格）。`
    );
  }

  return getDocxPayload(objToken, includeImages);
}
